import type { HighlightEnv } from './highlights';
import type { Segment } from './polish-diff';

/** A box in viewport coordinates. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The fixes popover for an underlined word. */
export interface PopoverState {
  /** The word, for placing the popover. */
  rect: Rect;
  dir: 'ltr' | 'rtl';
  font: string;
  suggestions: string[];
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
}

/** Everything the page draws around the message field. */
export interface AssistantState {
  popover?: PopoverState;
  ghost?: GhostState;
  polish: PolishState;
}

export const INITIAL_STATE: AssistantState = { polish: { canPolish: false, busy: false } };

/** What the page's event console shows: the model requests and answers, and what changed the text. */
export type AssistEvent =
  | { type: 'check-request'; text: string; completion: boolean }
  | { type: 'check-reply' | 'polish-reply'; reply: unknown }
  | { type: 'polish-request'; text: string }
  | { type: 'autocorrect' | 'revert' | 'pick'; original: string; replacement: string }
  | { type: 'ignore'; word: string }
  | { type: 'completion-accepted'; text: string }
  | { type: 'polish-accepted' };

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
