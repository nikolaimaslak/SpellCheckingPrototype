import type { TextMap, Token } from '../tokenizer';

/** The parts of an InputEvent the trigger looks at (lets tests pass plain objects). */
export interface InputLike {
  inputType: string;
  data: string | null;
  isComposing: boolean;
}

const BOUNDARY_CHAR = /^[\s\p{P}]$/u;
const GAP = /^[\s\p{P}￼]{1,3}$/u;

/** True when the agent just typed one boundary: a space, punctuation, line break or new paragraph. */
export function isTypedBoundary(e: InputLike): boolean {
  if (e.isComposing) return false;
  if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') return true;
  // Paste, drops, undo/redo and multi-character host insertions (predefined
  // messages) all fail here; an emoji is one code point but not a boundary.
  return e.inputType === 'insertText' && e.data !== null && [...e.data].length === 1 && BOUNDARY_CHAR.test(e.data);
}

/**
 * The word the agent just completed by typing a boundary, or undefined. Only
 * the token immediately before the caret qualifies, separated from it by the
 * boundary just typed (a few separator characters at most).
 */
export function completedWord(e: InputLike, map: TextMap, caret: number | undefined, tokens: Token[]): Token | undefined {
  if (caret === undefined || !isTypedBoundary(e)) return undefined;
  let last: Token | undefined;
  for (const t of tokens) {
    if (t.end <= caret) last = t;
    else break;
  }
  if (!last) return undefined;
  return GAP.test(map.text.slice(last.end, caret)) ? last : undefined;
}
