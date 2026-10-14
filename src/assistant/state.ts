import type { HighlightEnv } from './highlights';
import type { Segment } from './polish-diff';
import type { Lang } from '../spell/protocol';

/** A box in viewport coordinates. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The suggestions popover for a flagged word, or the revert form for an auto-corrected one. */
export interface PopoverState {
  /** The word, for placing the popover. */
  rect: Rect;
  dir: 'ltr' | 'rtl';
  font: string;
  suggestions: string[];
  /** Set for an auto-corrected word: the only choice is to go back to it. */
  revertTo?: string;
}

/** Where to draw the ghost text so its first line starts at the caret. */
export interface GhostLayout {
  top: number;
  left: number;
  width: number;
  textIndent: number;
  textAlign: 'start' | 'left';
  direction: 'ltr' | 'rtl';
  font: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface GhostState {
  text: string;
  /** null while the caret is unknown or scrolled out of view. */
  layout: GhostLayout | null;
}

export interface PolishState {
  /** Enough words to polish, and nothing else is open. */
  canPolish: boolean;
  busy: boolean;
  /** The preview of the changes, or only a message ("No changes suggested."). */
  preview?: { dir: 'ltr' | 'rtl'; segments: Segment[]; message?: string };
  /** A multi-place polish was applied: offer a one-click revert. */
  revertable: boolean;
}

/** Everything the page draws around the message field. */
export interface AssistantState {
  popover?: PopoverState;
  ghost?: GhostState;
  polish: PolishState;
}

export const INITIAL_STATE: AssistantState = { polish: { canPolish: false, busy: false, revertable: false } };

export type SpellingEvent =
  | { type: 'flag'; lang: Lang; original: string }
  | { type: 'autocorrect' | 'revert'; lang: Lang; original: string; replacement: string }
  | { type: 'accept'; lang: Lang; original: string; replacement: string; rank: number; offered: number }
  | { type: 'ignore'; lang: Lang; original: string };

export type CompletionEvent =
  | { type: 'completion-shown'; lang: Lang; latencyMs: number; shownLength: number }
  | { type: 'completion-accepted'; lang: Lang; latencyMs: number; shownLength: number; acceptedLength: number }
  | { type: 'completion-dismissed'; lang: Lang; shownLength: number };

export type PolishEvent =
  | { type: 'polish-shown'; lang: Lang; latencyMs: number; changes: number }
  | { type: 'polish-accepted'; lang: Lang; changes: number }
  | { type: 'polish-dismissed' | 'polish-reverted'; lang: Lang };

/** What the server was asked and what it answered, for the page's event console. */
export type ServerEvent =
  | { type: 'complete-request'; prefix: string; turns: number; canned: number; kb: number }
  | { type: 'complete-reply' | 'polish-reply'; reply: unknown; aborted?: boolean }
  | { type: 'polish-request'; text: string };

export type AssistEvent = SpellingEvent | CompletionEvent | PolishEvent | ServerEvent;

/** Browser parts the features use, replaceable in tests (jsdom has no highlights, layout or editing). */
export interface AssistantEnv {
  /** The single text-change path: replace `range` with `text` as a native, undoable edit. */
  replace(range: Range, text: string): void;
  highlights: HighlightEnv;
  /** The word's box, for the popover. */
  rectOf(range: Range): Rect;
  /** The caret's box (of the character before it), null if unknown. */
  caretRect(el: HTMLElement): Rect | null;
  /** The field's content box (border and padding removed). */
  contentBox(el: HTMLElement): Rect;
  /** macOS: Option (not Ctrl) + forward arrow accepts a word. */
  isMac: boolean;
}

/** What createAssistant hands every feature. */
export interface Shared {
  el: HTMLElement;
  env: AssistantEnv;
  log(event: AssistEvent): void;
  getState(): AssistantState;
  setState(patch: Partial<AssistantState>): void;
}
