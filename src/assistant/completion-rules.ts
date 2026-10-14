// Pure rules of inline completion: when to ask, what a key does, where the
// ghost text goes. No DOM access, so they are tested with plain values.
import type { GhostLayout, Rect } from './state';

// --- When to ask -----------------------------------------------------------

export interface TriggerState {
  /** The text up to the caret. */
  before: string;
  /** Text after the caret on the same line ('' at line end). */
  after: string;
  composing: boolean;
  /** The suggestions popover or the polish preview is open. */
  overlayOpen: boolean;
}

const MIN_WORDS = 3;
const SENTENCE_END = /[.!?؟\n]/u;

/** The sentence being typed: everything after the last terminator. */
export function currentSentence(before: string): string {
  const parts = before.split(SENTENCE_END);
  return parts[parts.length - 1];
}

/** True when a completion may be requested: caret at the end of its line, 3+ words in the sentence. */
export function shouldRequest(s: TriggerState): boolean {
  if (s.composing || s.overlayOpen) return false;
  if (s.after.replace(/\s/g, '') !== '') return false;
  const words = currentSentence(s.before).match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= MIN_WORDS;
}

// --- Keys ------------------------------------------------------------------

/** What a key press does while ghost text is showing. */
export type GhostKeyAction = 'accept-all' | 'accept-word' | 'dismiss' | 'escape' | 'none';

/** The parts of a KeyboardEvent the classifier looks at. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const DISMISS = new Set(['Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * Tab or the forward arrow (pointing in the suggestion's reading direction)
 * accepts it all; Ctrl + forward arrow (Option on macOS, where Ctrl+arrow
 * switches desktops) accepts the next word. Other navigation dismisses
 * without being intercepted.
 */
export function ghostKeyAction(e: KeyLike, dir: 'ltr' | 'rtl', isMac: boolean): GhostKeyAction {
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (e.key === 'Tab') return plain ? 'accept-all' : 'none';
  if (e.key === 'Escape') return 'escape';
  if (e.key === forward) {
    if (plain) return 'accept-all';
    const wordModifier = isMac ? e.altKey && !e.ctrlKey : e.ctrlKey && !e.altKey;
    return wordModifier && !e.shiftKey && !e.metaKey ? 'accept-word' : 'dismiss';
  }
  if (e.key === backward || DISMISS.has(e.key)) return 'dismiss';
  return 'none';
}

/** The ghost text's next word: any leading whitespace, then everything up to the next whitespace. */
export function nextWord(text: string): string {
  return /^\s*\S+/u.exec(text)?.[0] ?? text;
}

/** macOS, where Option (not Ctrl) is the word-jump modifier. */
export function detectMac(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined): boolean {
  const data = (nav as { userAgentData?: { platform?: string } } | undefined)?.userAgentData?.platform;
  return /mac/i.test(data ?? nav?.platform ?? '');
}

// --- Where to draw ---------------------------------------------------------

/** The field's computed text style. */
export interface FieldStyle {
  font: string;
  lineHeight: string;
  letterSpacing: string;
  direction: string;
}

/**
 * Ghost text layout: its first line starts exactly at the caret (text-indent),
 * later lines wrap within the field's content box. Null when the caret is
 * unknown or its line is scrolled out of view.
 */
export function ghostLayout(caret: Rect | null, content: Rect, style: FieldStyle, dir: 'ltr' | 'rtl'): GhostLayout | null {
  if (!caret || caret.top < content.top - 1 || caret.bottom > content.bottom + 1) return null;
  // An Arabic line in a left-to-right field ends at its left edge, with no room
  // to continue on the same line: continue on the line below, left-aligned.
  const below = dir === 'rtl' && style.direction === 'ltr';
  return {
    top: below ? caret.bottom : caret.top,
    left: content.left,
    width: Math.max(0, content.right - content.left),
    textIndent: below ? 0 : Math.max(0, dir === 'rtl' ? content.right - caret.left : caret.right - content.left),
    textAlign: below ? 'left' : 'start',
    direction: dir,
    font: style.font,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
}
