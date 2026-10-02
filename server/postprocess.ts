import { scriptOf } from './types.ts';

const MAX_WORDS = 20;
const TERMINATOR = /[.!?؟]/u;

/**
 * Turns raw model output into a safe continuation of `prefix`: no repetition
 * of the prefix, one line, at most one sentence and 20 words, same script as
 * the prefix's last word. Returns '' when nothing usable remains.
 */
export function postprocess(prefix: string, raw: string): string {
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

  const end = out.search(TERMINATOR);
  if (end >= 0) out = out.slice(0, end + 1);
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) out = words.slice(0, MAX_WORDS).join(' ');
  if (!out || !/[\p{L}\p{N}]/u.test(out)) return '';

  const want = scriptOf(prefix);
  const firstWord = out.match(/[\p{L}\p{M}]+/u)?.[0] ?? '';
  const got = scriptOf(firstWord);
  if (want && got && want !== got) return '';

  const needsSpace = !/\s$/u.test(prefix) && /^[\p{L}\p{N}]/u.test(out);
  return needsSpace ? ` ${out}` : out;
}
