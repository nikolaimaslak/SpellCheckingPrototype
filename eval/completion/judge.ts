// Judges one completion against its case: the word at the seam, spacing, the
// replay invariants, and details the model invented. Pure functions.
import type { CompletionCase } from './cases.ts';

export interface Reply {
  completion: string;
  edit?: { typed: string; word: string; rest: string };
  withheld?: string;
}

const WORD = /[\p{L}\p{N}\p{M}]/u;
const DIACRITICS = /[ً-ٰٟـ]/gu;
const TERMINATOR = /[.!?؟](?=\s|$)/gu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const LINK = /\b(?:https?:\/\/|www\.)\S+/giu;
const DIGITS = /\p{Nd}+/gu;

/** Lower case, no Arabic diacritics or tatweel: how seam words and details are compared. */
export const fold = (s: string) => s.toLowerCase().replace(DIACRITICS, '');

/** Arabic-Indic and Persian digits as Western ones. */
const westernDigits = (s: string) => s.replace(/[٠-٩]/gu, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/gu, (d) => String(d.charCodeAt(0) - 0x06f0));

/** The word of `text` that spans index `at`, or '' when `at` isn't inside a word. */
export function wordAt(text: string, at: number): string {
  if (at < 0 || !WORD.test(text[at] ?? '')) return '';
  let s = at;
  let e = at + 1;
  while (s > 0 && WORD.test(text[s - 1])) s--;
  while (e < text.length && WORD.test(text[e])) e++;
  return text.slice(s, e);
}

/** The case's word as it reads after the suggestion; null when the case sets no seam word or nothing is shown. */
export function seamOk(c: CompletionCase, completion: string): boolean | null {
  if (!c.seamWord || !completion) return null;
  return fold(wordAt(c.prefix + completion, c.prefix.length - 1)) === fold(c.seamWord);
}

/** A space after a prefix ending in whitespace, or a letter joined to a prefix ending in punctuation. */
export function spacingError(prefix: string, completion: string): boolean {
  if (!completion) return false;
  const last = prefix.at(-1) ?? '';
  if (/\s/u.test(last)) return /^\s/u.test(completion);
  if (!WORD.test(last)) return /^[\p{L}\p{N}]/u.test(completion);
  return false;
}

function scriptOf(text: string): 'en' | 'ar' | null {
  const w = text.replace(EMAIL, ' ').replace(LINK, ' ').match(/[\p{L}\p{M}]+/u)?.[0] ?? '';
  if (/\p{Script=Arabic}/u.test(w)) return 'ar';
  if (/\p{Script=Latin}/u.test(w)) return 'en';
  return null;
}
const lastScript = (prefix: string) => scriptOf(prefix.match(/[\p{L}\p{M}]+(?=[^\p{L}\p{M}]*$)/u)?.[0] ?? '');

/** The replay invariants a shown completion must keep; the list of broken ones (empty when all hold). */
export function invariants(c: CompletionCase, reply: Reply): string[] {
  const broken: string[] = [];
  const { completion, edit } = reply;
  if (!completion) return broken;
  if (seamOk(c, completion) === false) broken.push(`seam word is "${wordAt(c.prefix + completion, c.prefix.length - 1)}", expected "${c.seamWord}"`);
  if (spacingError(c.prefix, completion)) broken.push('spacing error at the seam');
  if (!edit) broken.push('no edit');
  else if (edit.word.slice(edit.typed.length) + edit.rest !== completion) broken.push('edit does not describe the completion');
  if ((completion.match(TERMINATOR) ?? []).length > 1) broken.push('more than one sentence');
  const want = lastScript(c.prefix);
  const got = scriptOf(completion);
  if (want && got && want !== got) broken.push(`script ${got}, prefix ${want}`);
  return broken;
}

/**
 * Details in the completion that the context doesn't have: digit runs,
 * emails and links, plus the case's `mustNotInvent` strings. `context` is
 * everything the model was given (prefix, conversation, sources).
 */
export function inventions(completion: string, context: string, mustNotInvent: readonly string[] = []): string[] {
  const ctx = fold(westernDigits(context));
  const out = fold(westernDigits(completion));
  const found = new Set<string>();
  for (const m of out.match(EMAIL) ?? []) if (!ctx.includes(m)) found.add(m);
  for (const raw of out.match(LINK) ?? []) {
    const m = raw.replace(/[.,;:!?)\]]+$/u, '');
    if (!ctx.includes(m)) found.add(m);
  }
  const outside = out.replace(EMAIL, ' ').replace(LINK, ' ');
  const ctxDigits = new Set(ctx.match(DIGITS) ?? []);
  for (const d of outside.match(DIGITS) ?? []) if (!ctxDigits.has(d)) found.add(d);
  for (const s of mustNotInvent) if (out.includes(fold(s)) && !ctx.includes(fold(s))) found.add(s);
  return [...found];
}
