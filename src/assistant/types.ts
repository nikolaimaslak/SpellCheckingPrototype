import type { DiffSegment } from './polish/word-diff';

export type TextDirection = 'ltr' | 'rtl';

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface PopoverState {
  wordRect: Rect;
  dir: TextDirection;
  font: string;
  suggestions: string[];
}

export interface GhostLayout {
  top: number;
  left: number;
  width: number;
  textIndent: number;
  textAlign: 'start' | 'left';
  direction: TextDirection;
  font: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface GhostState {
  text: string;
  layout: GhostLayout | null;
}

export interface PolishState {
  canPolish: boolean;
  busy: boolean;
  preview?: { dir: TextDirection; segments: DiffSegment[]; message?: string };
}

export interface AssistantState {
  popover?: PopoverState;
  ghost?: GhostState;
  polish: PolishState;
}

export const INITIAL_STATE: AssistantState = { polish: { canPolish: false, busy: false } };

export type AssistEvent =
  | { type: 'check-request'; text: string; completion: boolean }
  | { type: 'check-reply' | 'polish-reply'; reply: unknown }
  | { type: 'polish-request'; text: string }
  | { type: 'autocorrect' | 'polish' | 'revert' | 'pick'; original: string; replacement: string }
  | { type: 'ignore'; word: string }
  | { type: 'completion-accepted'; text: string };

export interface AssistantOptions {
  apiKey: string;
  spelling: 'off' | 'suggest' | 'auto';
  completion: boolean;
  customWords: string[];
  canned: string[];
  kb: string[];
  conversation: () => Turn[];
  log?: (event: AssistEvent) => void;
}

export interface AssistantContext {
  field: HTMLElement;
  log(event: AssistEvent): void;
  getState(): AssistantState;
  setState(patch: Partial<AssistantState>): void;
}
