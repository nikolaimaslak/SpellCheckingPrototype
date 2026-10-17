import type { Mistake } from './llm';
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

export interface AssistantState {
  popover?: PopoverState;
  ghost?: GhostState;
  loader?:
    | {
        kind: 'debounce';
        startedAt: number;
        durationMs: number;
      }
    | { kind: 'request' }
    | { kind: 'failed' };
}

export const INITIAL_STATE: AssistantState = {};

export type AssistEvent =
  | {
      type: 'send-to-llm';
      text: string;
      withCompletion: boolean;
    }
  | { type: 'llm-answer'; reply: unknown }
  | {
      type: 'autocorrect' | 'revert' | 'pick';
      original: string;
      replacement: string;
    }
  | { type: 'ignore'; word: string }
  | { type: 'completion-accepted'; text: string };

export interface AssistantOptions {
  apiKey: string;
  spellCheckMode: 'off' | 'underline' | 'auto-correct';
  withCompletion: boolean;
  debounceMs: number;
  customWords: string[];
  ignoredWords: string[];
  onIgnoredWordsChange: (words: string[]) => void;
  llmContext: string;
  log: (event: AssistEvent) => void;
}

export interface SpellingData {
  mistakes: Mistake[];
  replacementByOriginal: Map<string, string>;
  undoneAutoCorrections: { original: string; replacement: string }[];
  openPopover?: { place: PlacedMistake; selectionBefore?: Range };
}

export interface TypingData {
  requestTimer?: ReturnType<typeof setTimeout>;
  runningRequest?: AbortController;
  debounceStartedAt: number;
  lastSentText: string;
  isComposing: boolean;
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
}
