import type { Mistake } from './llm/check-request';
import type { DiffSegment } from './polish/word-diff';
import type { PlacedMistake } from './text/mistake-places';

export type TextDirection = 'ltr' | 'rtl';

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
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
  caretOffset: number;
  fieldText: string;
  direction: TextDirection;
}

export interface PolishState {
  busy: boolean;
  preview?: { dir: TextDirection; segments: DiffSegment[]; message?: string };
}

export interface AssistantState {
  popover?: PopoverState;
  ghost?: GhostState;
  polish: PolishState;
  loader?: { kind: 'pause'; startedAt: number; durationMs: number } | { kind: 'request' };
}

export const INITIAL_STATE: AssistantState = { polish: { busy: false } };

export type AssistEvent =
  | { type: 'send-to-llm'; text: string; completion: boolean }
  | { type: 'llm-answer' | 'polish-reply'; reply: unknown }
  | { type: 'polish-request'; text: string }
  | { type: 'autocorrect' | 'revert' | 'pick'; original: string; replacement: string }
  | { type: 'polish'; text: string }
  | { type: 'ignore'; word: string }
  | { type: 'completion-accepted'; text: string };

export interface AssistantOptions {
  apiKey: string;
  spelling: 'off' | 'suggest' | 'auto';
  completion: boolean;
  debounceMs: number;
  customWords: string[];
  ignoredWords: string[];
  onIgnoredWordsChange: (words: string[]) => void;
  canned: string[];
  kb: string[];
  conversation: string;
  log: (event: AssistEvent) => void;
}

export interface SpellingData {
  mistakes: Mistake[];
  replacementByOriginal: Map<string, string>;
  openPopover?: { place: PlacedMistake; selectionBefore?: Range };
}

export interface TypingData {
  requestTimer?: ReturnType<typeof setTimeout>;
  runningRequest?: AbortController;
  pauseStartedAt: number;
  lastSentText: string;
  isComposing: boolean;
}

export interface PolishData {
  runningRequest?: AbortController;
  openPreview?: { sentDraft: string; polishedText: string };
}

export interface AssistantContext {
  field: HTMLElement;
  options: AssistantOptions;
  log(event: AssistEvent): void;
  getState(): AssistantState;
  setState(patch: Partial<AssistantState>): void;
  isReplacingWords: boolean;
  replacedFlashTimer?: ReturnType<typeof setTimeout>;
  ignoredWords: string[];
  customWords: Set<string>;
  spelling: SpellingData;
  typing: TypingData;
  polish: PolishData;
}
