import type { TextMap, Token } from '../tokenizer';

/** The parts of an InputEvent the trigger looks at (lets tests pass plain objects). */
export interface InputLike {
  inputType: string;
  data: string | null;
  isComposing: boolean;
}

const BOUNDARY_CHAR = /^[\s\p{P}]$/u;
const GAP = /^[\s\p{P}￼]{1,3}$/u;
// Characters that also occur inside email addresses and URLs: a word they
// complete may turn out to be part of one, so its decision waits (KI-2).
const HOLD_CHAR = /^[.@:/]$/u;

/** True when the agent just typed one boundary: a space, punctuation, line break or new paragraph. */
export function isTypedBoundary(e: InputLike): boolean {
  if (e.isComposing) return false;
  if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') return true;
  // Paste, drops, undo/redo and multi-character host insertions (predefined
  // messages) all fail here; an emoji is one code point but not a boundary.
  return e.inputType === 'insertText' && e.data !== null && [...e.data].length === 1 && BOUNDARY_CHAR.test(e.data);
}

/**
 * What a typed input means for auto-correct:
 * - `release`: whitespace, a line break or a new paragraph: decide the
 *   completed word and the held words of the same run;
 * - `hold`: `.` `@` `:` `/`: hold the completed word until whitespace;
 * - `decide`: any other single punctuation: decide the completed word now;
 * - `none`: not a typed boundary (paste, multi-character input, IME, undo…).
 */
export function boundaryKind(e: InputLike): 'none' | 'decide' | 'hold' | 'release' {
  if (!isTypedBoundary(e)) return 'none';
  if (e.inputType !== 'insertText' || /^\s$/u.test(e.data ?? '')) return 'release';
  return HOLD_CHAR.test(e.data ?? '') ? 'hold' : 'decide';
}

/** A held word: where it started and what it said when it was completed. */
export interface HeldWord {
  start: number;
  text: string;
}

/**
 * The held words to decide now that whitespace was typed at `caret`: those
 * that are still a checkable token, unchanged and in the same place, inside
 * the run of non-whitespace text that ends where the whitespace begins. A
 * word that became part of an excluded span ("gosi" in "info@gosi.gov.sa")
 * is no longer a token and is dropped, as are words of other runs.
 */
export function releasable<T extends { start: number; end: number; text: string }>(
  held: readonly HeldWord[],
  text: string,
  caret: number,
  tokens: readonly T[],
): T[] {
  let runEnd = caret;
  while (runEnd > 0 && /\s/u.test(text[runEnd - 1])) runEnd--;
  let runStart = runEnd;
  while (runStart > 0 && !/\s/u.test(text[runStart - 1])) runStart--;
  return tokens.filter(
    (t) => t.start >= runStart && t.end <= runEnd && held.some((h) => h.start === t.start && h.text === t.text),
  );
}

/**
 * The word the agent just completed by typing a boundary, or undefined. Only
 * the token immediately before the caret qualifies, separated from it by the
 * boundary just typed (a few separator characters at most).
 */
export function completedWord<T extends Pick<Token, 'start' | 'end'>>(
  e: InputLike,
  map: Pick<TextMap, 'text'>,
  caret: number | undefined,
  tokens: readonly T[],
): T | undefined {
  if (caret === undefined || !isTypedBoundary(e)) return undefined;
  let last: T | undefined;
  for (const t of tokens) {
    if (t.end <= caret) last = t;
    else break;
  }
  if (!last) return undefined;
  return GAP.test(map.text.slice(last.end, caret)) ? last : undefined;
}
