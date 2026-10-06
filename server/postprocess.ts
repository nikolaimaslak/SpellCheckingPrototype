import { scriptOf } from './types.ts';

const MAX_WORDS = 20;
// A sentence ends at . ! ? ؟ followed by whitespace or the end, so emails, links and decimals stay whole.
const TERMINATOR = /[.!?؟](?=\s|$)/u;
// Emails and links are written in Latin letters in either language: they don't decide the script.
const IDENTIFIER = /\b(?:https?:\/\/|www\.)\S+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const TYPED = /[\p{L}\p{N}\p{M}]+$/u;

/** The model's structured answer: the current word in full, and what follows it. */
export interface Structured {
  word: string;
  rest: string;
}

/** The edit a suggestion makes: `completion` = `word` without its first `typed.length` characters, then `rest`. */
export interface Edit {
  typed: string;
  word: string;
  rest: string;
}

/** Parses the model's JSON output; null unless it is an object with string `word` and `rest`. */
export function parseStructured(raw: string): Structured | null {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const { word, rest } = o as Record<string, unknown>;
  return typeof word === 'string' && typeof rest === 'string' ? { word, rest } : null;
}

/**
 * Builds the suggestion from the model's answer. With an unfinished word
 * (`typed`), `word` must extend it (letter case ignored) and the suggestion
 * is the rest of `word` plus `rest`; anything else is 'format', never an edit
 * of what the agent typed. Without one, the suggestion is `word` + `rest`,
 * with a space after punctuation.
 */
export function assemble(prefix: string, { word, rest }: Structured): { completion: string; edit: Edit } | 'format' {
  const typed = prefix.match(TYPED)?.[0] ?? '';
  if (typed) {
    if (!word.toLowerCase().startsWith(typed.toLowerCase())) return 'format';
    if (word.length === typed.length && !rest) return 'format';
    return { completion: word.slice(typed.length) + rest, edit: { typed, word, rest } };
  }
  // No word is being typed: the whole answer is new text.
  let completion = word + rest;
  if (!/\s$/u.test(prefix) && /^[\p{L}\p{N}]/u.test(completion)) completion = ` ${completion}`;
  return { completion, edit: { typed: '', word: '', rest: completion } };
}

/**
 * Keeps a suggestion safe to show: one line, no restating of the prefix's
 * tail, at most one sentence and 20 words, same script as the prefix's last
 * word. Returns '' when nothing usable remains. The leading characters
 * `assemble` produced (a join or a space) are kept.
 */
export function finalize(prefix: string, completion: string): string {
  let out = completion.split(/\r?\n/)[0].trimEnd();

  // A new word that restates the prefix's tail ("…your request " + "your request will…").
  const midWord = TYPED.test(prefix) && /^[\p{L}\p{N}\p{M}]/u.test(out);
  if (!midWord) {
    const body = out.trimStart();
    const lower = body.toLowerCase();
    const prefixWords = prefix.trim().split(/\s+/);
    for (let n = Math.min(prefixWords.length, 12); n >= 1; n--) {
      const tail = prefixWords.slice(-n).join(' ').toLowerCase();
      if (lower.startsWith(tail) && (lower.length === tail.length || /[\s\p{P}]/u.test(lower[tail.length]))) {
        out = body.slice(tail.length).trimStart();
        if (!/\s$/u.test(prefix) && /^[\p{L}\p{N}]/u.test(out)) out = ` ${out}`;
        break;
      }
    }
  }

  const end = out.search(TERMINATOR);
  if (end >= 0) out = out.slice(0, end + 1);
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) out = (/^\s/u.test(out) ? ' ' : '') + words.slice(0, MAX_WORDS).join(' ');
  if (!/[\p{L}\p{N}]/u.test(out)) return '';

  const want = scriptOf(prefix);
  const got = scriptOf(out.replace(IDENTIFIER, ' ').match(/[\p{L}\p{M}]+/u)?.[0] ?? '');
  if (want && got && want !== got) return '';
  return out;
}
