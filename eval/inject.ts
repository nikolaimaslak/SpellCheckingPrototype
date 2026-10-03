// Inserts misspellings of chosen types into correct text and labels them.
// Sentence mode picks eligible words at a rate; per-word mode makes one
// variant of every selected type for each word of a word list. A variant the
// engine accepts is a real-word error ("form" for "from"): it is discarded,
// counted, and another variant or type is tried.
import { languageOf } from '../src/tokenizer';
import { TYPES, mulberry32, stripMarks, variants, type EditType, type Lang } from './error-types.ts';
import type { Pipeline } from './pipeline.ts';
import type { Label, Message } from './types.ts';

export const GENERATOR_VERSION = 1;
const MAX_ATTEMPTS = 4; // the first choice plus up to 3 retries

export interface InjectOptions {
  langs: Lang[];
  /** Selected types; default: every type of each language. */
  types?: EditType[];
  /** Sentence mode: share of eligible words that get an error. */
  rate?: number;
  /** Per-word mode: one variant of each selected type for every word. */
  perWord?: boolean;
  seed: number;
  customWords?: string[];
}

export interface InjectStats {
  eligible: number;
  inserted: Partial<Record<EditType, number>>;
  /** Variants discarded because the engine accepts them as words. */
  realWord: Partial<Record<EditType, number>>;
  /** Words where a type had no applicable position (per-word mode). */
  notApplicable: Partial<Record<EditType, number>>;
}

export interface InjectResult {
  messages: Message[];
  stats: InjectStats;
}

const bump = (o: Partial<Record<EditType, number>>, t: EditType) => (o[t] = (o[t] ?? 0) + 1);

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createInjector(pipeline: Pipeline, options: InjectOptions) {
  const rng = mulberry32(options.seed);
  const custom = new Set(options.customWords ?? []);
  const stats: InjectStats = { eligible: 0, inserted: {}, realWord: {}, notApplicable: {} };
  const typesFor = (lang: Lang) => TYPES[lang].filter((t) => !options.types || options.types.includes(t));

  /** A misspelled variant of `word` of one of `types`, trying up to MAX_ATTEMPTS variants. */
  async function misspell(word: string, lang: Lang, types: EditType[]): Promise<{ variant: string; type: EditType } | null> {
    let attempts = 0;
    for (const type of types) {
      for (const variant of shuffle(variants(word, type, lang), rng)) {
        if (attempts++ >= MAX_ATTEMPTS) return null;
        // The variant must still be one checkable word of the same language.
        if (languageOf(variant) !== lang) continue;
        if (await pipeline.isCorrect(variant, lang)) {
          bump(stats.realWord, type);
          continue;
        }
        return { variant, type };
      }
    }
    return null;
  }

  /** Sentence mode over messages: existing labels are kept and shifted. */
  async function injectMessage(message: Message): Promise<Message> {
    const labels = message.labels ?? [];
    const covered = (start: number, end: number) => labels.some((l) => start < l.start + l.word.length && l.start < end);
    const { tokens } = await pipeline.run(message.text);
    const edits: { start: number; end: number; variant: string; label: Label }[] = [];
    for (const t of tokens) {
      if (!options.langs.includes(t.lang) || t.flagged || custom.has(t.word) || covered(t.start, t.end)) continue;
      stats.eligible++;
      if (rng() >= (options.rate ?? 0.08)) continue;
      const types = shuffle(typesFor(t.lang), rng);
      const hit = await misspell(t.word, t.lang, types);
      if (!hit) continue;
      bump(stats.inserted, hit.type);
      edits.push({ start: t.start, end: t.end, variant: hit.variant, label: { start: t.start, word: hit.variant, gold: 'misspelled', intended: t.word, type: hit.type } });
    }
    if (!edits.length) return message;

    let text = message.text;
    let next = labels.map((l) => ({ ...l }));
    for (const e of [...edits].reverse()) {
      const delta = e.variant.length - (e.end - e.start);
      text = text.slice(0, e.start) + e.variant + text.slice(e.end);
      next = next.map((l) => (l.start >= e.end ? { ...l, start: l.start + delta } : l));
      // Labels of later edits were made against the original text; shift them too.
      for (const other of edits) if (other.label.start >= e.end) other.label.start += delta;
    }
    next.push(...edits.map((e) => e.label));
    next.sort((a, b) => a.start - b.start);
    return { id: message.id, text, labels: next };
  }

  /** Per-word mode: one message per (word, type) variant. */
  async function injectWord(word: string, lang: Lang): Promise<Message[]> {
    const out: Message[] = [];
    if (custom.has(word)) return out;
    stats.eligible++;
    for (const type of typesFor(lang)) {
      if (!variants(stripMarks(word), type, lang).length) {
        bump(stats.notApplicable, type);
        continue;
      }
      const hit = await misspell(word, lang, [type]);
      if (!hit) continue;
      bump(stats.inserted, type);
      out.push({ id: `${word}#${type}`, text: hit.variant, labels: [{ start: 0, word: hit.variant, gold: 'misspelled', intended: word, type }] });
    }
    return out;
  }

  return { injectMessage, injectWord, stats };
}

export async function injectMessages(pipeline: Pipeline, messages: Message[], options: InjectOptions): Promise<InjectResult> {
  const injector = createInjector(pipeline, options);
  const out: Message[] = [];
  for (const m of messages) out.push(await injector.injectMessage(m));
  return { messages: out, stats: injector.stats };
}

export async function injectWords(pipeline: Pipeline, words: { word: string; lang: Lang }[], options: InjectOptions): Promise<InjectResult> {
  const injector = createInjector(pipeline, options);
  const out: Message[] = [];
  for (const { word, lang } of words) {
    if (!options.langs.includes(lang)) continue;
    if (options.perWord) out.push(...(await injector.injectWord(word, lang)));
    else out.push(await injector.injectMessage({ id: word, text: word }));
  }
  return { messages: out, stats: injector.stats };
}
