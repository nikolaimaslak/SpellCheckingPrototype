// The composer's Tier 1 spelling path, run on plain messages: tokenizer
// (exclusions, per-word language), Hunspell with the committed dictionaries,
// the custom dictionary, and the auto-replace confidence rule. Mirrors
// src/composer/attach.ts as if the message were typed from start to end,
// with the same trigger functions (src/autocorrect/trigger.ts):
// auto-replacement is decided for the word each typed boundary completes, on
// the text typed so far, holding words completed by . @ : / until the next
// whitespace; underlines are decided on the finished text. A message that
// doesn't end in whitespace gets a space, so its last word counts as
// completed (the worst case for corrupting correct words).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { caseFolded, decide, needsEvidence, withLeadingCapital, type AutoReplaceConfidence, type FixSource } from '../src/autocorrect/confidence';
import { knownFix } from '../src/autocorrect/misspellings';
import { boundaryKind, completedWord, releasable, type HeldWord } from '../src/autocorrect/trigger';
import { loadHunspell } from '../src/spell/engine';
import { createHandler, type DictionaryLoader } from '../src/spell/handler';
import type { Lang, ResultByType, SpellCommand, SpellRequest } from '../src/spell/protocol';
import { buildTextMap, languageOf, tokenize, type Token } from '../src/tokenizer';

export interface TokenResult {
  word: string;
  lang: Lang;
  /** Flat-text offsets, [start, end). */
  start: number;
  end: number;
  /** Underlined (or auto-replaced): the engine rejects the word. */
  flagged: boolean;
  /** The suggestions the popover offers for a flagged word, in order (a known misspelling's fix first). */
  suggestions: string[];
  /** The auto-replacement the composer would make in `auto` mode, if any. */
  replacement: string | null;
  /** The rule that produced the auto-replacement. */
  replacementSource: FixSource | null;
  /** Engine time for the correctness check and, when flagged, for suggestions. */
  checkMs: number;
  suggestMs: number | null;
  /** Engine time for the auto-replace decision (neighbors request), when one was made. */
  decideMs: number | null;
}

/**
 * An auto-replacement made while typing, of a word that is not a word of the
 * finished text: "gosi" completed by the "." of "info@gosi.gov.sa" before the
 * address is recognizable as one.
 */
export interface TransientReplacement {
  word: string;
  lang: Lang;
  start: number;
  end: number;
  replacement: string;
  replacementSource: FixSource;
}

export interface PipelineResult {
  tokens: TokenResult[];
  transient: TransientReplacement[];
}

export interface PipelineOptions {
  languages?: Lang[];
  customWords?: string[];
  /** The admin's auto-replace confidence; the default, as in the composer. */
  autoReplace?: AutoReplaceConfidence;
}

export interface Pipeline {
  run(text: string): Promise<PipelineResult>;
  /** Whether the engine accepts a single word as correct. */
  isCorrect(word: string, lang: Lang): Promise<boolean>;
  /** The engine's suggestions for a word. */
  suggest(word: string, lang: Lang): Promise<string[]>;
}

export const loadDictionary: DictionaryLoader = async (lang) =>
  lang === 'en'
    ? { aff: readFileSync('node_modules/dictionary-en/index.aff'), dic: readFileSync('node_modules/dictionary-en/index.dic') }
    : { aff: readFileSync('dicts/ar/ar.aff'), dic: readFileSync('dicts/ar/ar.dic') };

const WASM = resolve('src/spell/wasm/hunspell.wasm');
/** The engine runtime, located on disk even where import.meta.url is an http URL (jsdom tests). */
export const loadRuntime = () => loadHunspell({ wasmBinary: readFileSync(WASM), locateFile: () => WASM });

const lastWhitespaceBefore = (text: string, index: number) => {
  for (let i = Math.min(index, text.length) - 1; i >= 0; i--) if (/\s/u.test(text[i])) return i;
  return -1;
};

/** Where the run of non-whitespace text that ends before index `i` (and its trailing whitespace) starts. */
const runStartBefore = (text: string, i: number) => {
  let end = i;
  while (end > 0 && /\s/u.test(text[end - 1])) end--;
  return lastWhitespaceBefore(text, end) + 1;
};

let dom: JSDOM | undefined;

/** A DOM for the tokenizer: the test environment's own, or a private jsdom. */
function documentForTokenizer(): Document {
  if (typeof document !== 'undefined') return document;
  dom ??= new JSDOM('<!doctype html><body></body>');
  // buildTextMap reads Node.TEXT_NODE and friends from the global scope.
  (globalThis as { Node?: unknown }).Node ??= dom.window.Node;
  return dom.window.document;
}

export async function createPipeline(options: PipelineOptions = {}): Promise<Pipeline> {
  const { languages = ['en', 'ar'], customWords = [], autoReplace = 'list-and-rule' } = options;
  const handle = createHandler(loadRuntime, loadDictionary);
  let id = 0;
  const request = async <C extends SpellCommand>(command: C): Promise<ResultByType[C['type']]> => {
    const reply = await handle({ ...command, id: ++id } as SpellRequest);
    if (!reply.ok) throw new Error(reply.error);
    return reply.result as ResultByType[C['type']];
  };

  const load = await request({ type: 'load', langs: languages });
  if (load.failed.length) throw new Error(`dictionary failed to load: ${load.failed.map((f) => `${f.lang} (${f.reason})`).join(', ')}`);
  // As the spell service does: each custom word goes to the engine of its script.
  for (const lang of languages) {
    for (const word of customWords.filter((w) => !/\s/.test(w) && languageOf(w) === lang)) await request({ type: 'add', lang, word });
  }
  const custom = new Set(customWords);
  const ctx = { ignored: new Set<string>(), customWords: custom };
  const doc = documentForTokenizer();

  const tokensOf = (text: string): Token[] => {
    const el = doc.createElement('div');
    el.textContent = text;
    return tokenize(buildTextMap(el)).filter((t) => languages.includes(t.lang));
  };

  const timed = async <T>(work: () => Promise<T>): Promise<[T, number]> => {
    const begin = performance.now();
    const result = await work();
    return [result, performance.now() - begin];
  };

  const misspelled = async (word: string, lang: Lang) => {
    const [checked, ms] = await timed(() => request({ type: 'check', words: { [lang]: [word] } }));
    return { flagged: (checked.misspelled[lang] ?? []).includes(word), ms };
  };

  // Suggestions are the engine's slow, time-limited call (KI-1). Within one
  // message each word gets them once: the composer, too, decides on the list
  // it got at the boundary.
  type Suggested = { list: string[]; ms: number };
  const suggestOnce = async (cache: Map<string, Promise<Suggested>>, word: string, lang: Lang): Promise<Suggested> => {
    const key = `${lang}:${word}`;
    if (!cache.has(key)) cache.set(key, timed(() => request({ type: 'suggest', lang, word })).then(([list, ms]) => ({ list, ms })));
    return cache.get(key)!;
  };

  /** The composer's auto-replacement for a completed word (attach.ts autoCorrect), and the decision's engine time. */
  type Replacement = { fix: string | null; source: FixSource | null; ms: number | null };
  const autoReplacement = async (t: Token): Promise<Replacement> => {
    if (custom.has(t.text) || !(await misspelled(t.text, t.lang)).flagged) return { fix: null, source: null, ms: null };
    let caseFix: string | null = null;
    let neighbors: string[] = [];
    let ms: number | null = null;
    if (needsEvidence(t.text, t.lang, autoReplace)) {
      const begin = performance.now();
      const folded = caseFolded(t.text, t.lang);
      caseFix = folded && (await request({ type: 'spell', lang: t.lang, word: folded })) ? folded : null;
      if (!caseFix) neighbors = await request({ type: 'neighbors', lang: t.lang, word: t.text });
      ms = performance.now() - begin;
    }
    const d = decide(t.text, t.lang, { neighbors, caseFix }, { ...ctx, confidence: autoReplace });
    return { fix: d?.fix ?? null, source: d?.source ?? null, ms };
  };

  /** The popover's suggestions (attach.ts showSuggestions): a known misspelling's fix first. */
  const popoverSuggestions = (word: string, lang: Lang, engine: string[]) => {
    const listed = knownFix(word, lang);
    const known = listed && withLeadingCapital(word, listed);
    return known ? [known, ...engine.filter((s) => s !== known)] : engine;
  };

  return {
    isCorrect: (word, lang) => request({ type: 'spell', lang, word }),
    suggest: (word, lang) => request({ type: 'suggest', lang, word }),
    async run(text) {
      const typed = /\s$/u.test(text) ? text : `${text} `;

      // Typing order, one character at a time, through the composer's trigger
      // functions. Exclusion patterns never span whitespace, so the text typed
      // so far can be tokenized from just after a whitespace that precedes
      // both the possible completed word (at most 3 characters back) and the
      // run of held words, with the same result.
      const completed = new Map<string, Token>();
      let held: HeldWord[] = [];
      for (let i = 0; i < typed.length; i++) {
        const input = { inputType: 'insertText', data: typed[i], isComposing: false };
        const kind = boundaryKind(input);
        if (kind === 'none') continue;
        const soFar = typed.slice(0, i + 1);
        const from = lastWhitespaceBefore(typed, Math.min(i - 3, runStartBefore(typed, i))) + 1;
        const tokens = tokensOf(typed.slice(from, i + 1)).map((t) => ({ ...t, start: t.start + from, end: t.end + from }));
        const done = completedWord(input, { text: soFar }, i + 1, tokens);
        const ready: Token[] = [];
        if (kind === 'decide' && done) ready.push(done);
        if (kind === 'hold' && done && !held.some((h) => h.start === done.start && h.text === done.text)) held.push(done);
        if (kind === 'release') {
          ready.push(...releasable(held, soFar, i + 1, tokens));
          held = [];
          if (done && !ready.some((t) => t.start === done.start)) ready.push(done);
        }
        for (const t of ready.sort((a, b) => a.start - b.start)) {
          const key = `${t.start}:${t.end}:${t.text}`;
          if (!completed.has(key)) completed.set(key, t);
        }
      }
      const suggested = new Map<string, Promise<Suggested>>();
      const replacements = new Map<string, Replacement>();
      for (const [key, t] of completed) replacements.set(key, await autoReplacement(t));

      const tokens: TokenResult[] = [];
      const final = new Set<string>();
      for (const t of tokensOf(text)) {
        const key = `${t.start}:${t.end}:${t.text}`;
        final.add(key);
        const { flagged, ms: checkMs } = await misspelled(t.text, t.lang);
        let suggestions: string[] = [];
        let suggestMs: number | null = null;
        if (flagged) {
          const s = await suggestOnce(suggested, t.text, t.lang);
          suggestions = popoverSuggestions(t.text, t.lang, s.list);
          suggestMs = s.ms;
        }
        tokens.push({
          word: t.text,
          lang: t.lang,
          start: t.start,
          end: t.end,
          flagged,
          suggestions,
          replacement: replacements.get(key)?.fix ?? null,
          replacementSource: replacements.get(key)?.source ?? null,
          checkMs,
          suggestMs,
          decideMs: replacements.get(key)?.ms ?? null,
        });
      }
      const transient: TransientReplacement[] = [];
      for (const [key, t] of completed) {
        const r = replacements.get(key);
        if (r?.fix && r.source && !final.has(key)) transient.push({ word: t.text, lang: t.lang, start: t.start, end: t.end, replacement: r.fix, replacementSource: r.source });
      }
      return { tokens, transient };
    },
  };
}
