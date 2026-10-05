import { scriptOf } from './types.ts';

const MAX_WORDS = 20;
const TERMINATOR = /[.!?؟]/u;

const PARTIAL = /[\p{L}\p{N}\p{M}]+$/u;
const FIRST_WORD = /^[\p{L}\p{N}\p{M}]+/u;

/**
 * Turns raw model output into a safe continuation of `prefix`: no repetition
 * of the prefix, one line, at most one sentence and 20 words, same script as
 * the prefix's last word. Returns '' when nothing usable remains.
 *
 * When the prefix ends inside a word, decides whether the output completes
 * that word (joined) or starts a new one (after a space): an echoed word is
 * stripped and joined; a raw leading space means a new word; otherwise the
 * vocabulary (`isWord`, normalized words of the approved texts, conversation
 * and prefix) decides, and without one a space is added as before.
 */
export function postprocess(prefix: string, raw: string, isWord?: (word: string) => boolean): string {
  const rawLeadingSpace = /^\s/u.test(raw);
  let out = raw.replace(/^[\s"'“”«»]+|[\s"'“”«»]+$/gu, '');
  out = out.split(/\r?\n/)[0];

  // Drop any repetition of the prefix's tail (the model restating what was typed).
  const prefixWords = prefix.trim().split(/\s+/);
  const lower = out.toLowerCase();
  for (let n = Math.min(prefixWords.length, 12); n >= 1; n--) {
    const tail = prefixWords.slice(-n).join(' ').toLowerCase();
    if (lower.startsWith(tail) && (lower.length === tail.length || /[\s\p{P}]/u.test(lower[tail.length]))) {
      out = out.slice(tail.length);
      break;
    }
  }
  out = out.trimStart();

  // The unfinished word at the end of the prefix, if the agent paused mid-word.
  const partial = /\s$/u.test(prefix) ? '' : (prefix.match(PARTIAL)?.[0] ?? '');
  let joined = false;
  if ([...partial].length >= 2) {
    // The model repeated the unfinished word ("proce" → "processed …"): keep only the rest.
    const first = out.match(FIRST_WORD)?.[0] ?? '';
    if (first.length > partial.length && first.toLowerCase().startsWith(partial.toLowerCase())) {
      out = out.slice(partial.length);
      joined = true;
    }
  }

  const end = out.search(TERMINATOR);
  if (end >= 0) out = out.slice(0, end + 1);
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) out = words.slice(0, MAX_WORDS).join(' ');
  if (!out || !/[\p{L}\p{N}]/u.test(out)) return '';

  const want = scriptOf(prefix);
  const firstWord = out.match(/[\p{L}\p{M}]+/u)?.[0] ?? '';
  const got = scriptOf(firstWord);
  if (want && got && want !== got) return '';

  return needsSpace(prefix, partial, out, joined, rawLeadingSpace, isWord) ? ` ${out}` : out;
}

/** Whether the continuation starts a new word (space) or completes the unfinished one (joined). */
function needsSpace(prefix: string, partial: string, out: string, joined: boolean, rawLeadingSpace: boolean, isWord?: (word: string) => boolean): boolean {
  if (/\s$/u.test(prefix) || !/^[\p{L}\p{N}]/u.test(out)) return false;
  if (!partial) return true; // after punctuation: a new word, as before
  if (joined) return false;
  if (rawLeadingSpace) return true;
  const first = out.match(FIRST_WORD)?.[0] ?? '';
  if (isWord?.(partial + first)) return false;
  if (!isWord || isWord(partial)) return true;
  return false;
}
