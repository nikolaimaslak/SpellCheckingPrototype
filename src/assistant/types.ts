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
  word: string;
  wordStartOffset: number;
  wordEndOffset: number;
  dir: TextDirection;
  suggestions: string[];
}

export interface GhostState {
  text: string;
  direction: TextDirection;
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
  loader?: { kind: 'pause'; startedAt: number; durationMs: number } | { kind: 'request' };
}

export const INITIAL_STATE: AssistantState = { polish: { canPolish: false, busy: false } };

export type AssistEvent =
  | { type: 'send-to-llm'; text: string; completion: boolean }
  | { type: 'llm-answer' | 'polish-reply'; reply: unknown }
  | { type: 'polish-request'; text: string }
  | { type: 'autocorrect' | 'polish' | 'revert' | 'pick'; original: string; replacement: string }
  | { type: 'ignore'; word: string }
  | { type: 'completion-accepted'; text: string };

export interface AssistantOptions {
  apiKey: string;
  spelling: 'off' | 'suggest' | 'auto';
  completion: boolean;
  debounceMs: number;
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
