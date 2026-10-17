import type { Mistake } from './llm';
import type { PlacedMistake } from './mistake-places';

export type TextDirection = 'ltr' | 'rtl';

export interface TextSpan {
  start: number;
  end: number;
}

export interface EditorControl {
  getText(): string;
  getCaret(): number | undefined;
  setCaret(offset: number): void;
  replaceText(start: number, end: number, text: string): void;
  showUnderlines(spans: TextSpan[]): void;
  showReplacedWords(spans: TextSpan[]): void;
}

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface TextInput {
  inputType: string;
  data: string | null;
}

export interface PopoverState {
  word: string;
  wordStartOffset: number;
  wordEndOffset: number;
  dir: TextDirection;
  suggestions: string[];
}

export interface AutoCompletionState {
  text: string;
  caretOffset: number;
  fieldText: string;
  direction: TextDirection;
}

export interface AssistantState {
  popover?: PopoverState;
  autoCompletion?: AutoCompletionState;
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
  | { type: 'spell-check-request' | 'auto-completion-request'; text: string }
  | { type: 'spell-check-answer' | 'auto-completion-answer'; reply: unknown }
  | { type: 'spell-check-error' | 'auto-completion-error'; error: string }
  | {
      type: 'autocorrect' | 'revert' | 'pick';
      original: string;
      replacement: string;
    }
  | { type: 'ignore'; word: string }
  | { type: 'auto-completion-accepted'; text: string };

export interface AssistantOptions {
  apiKey: string;
  spellCheckMode: 'off' | 'underline' | 'auto-correct';
  withAutoCompletion: boolean;
  isMac: boolean;
  debounceMs: number;
  customWords: string[];
  ignoredWords: string[];
  onIgnoredWordsChange: (words: string[]) => void;
  llmContext: string;
  log: (event: AssistEvent) => void;
}

export interface SpellCheckData {
  mistakes: Mistake[];
  replacementByOriginal: Map<string, string>;
  undoneAutoCorrections: { original: string; replacement: string }[];
  openPopover?: { place: PlacedMistake; caretBefore?: number };
}

export interface TypingData {
  requestTimer?: ReturnType<typeof setTimeout>;
  runningRequest?: AbortController;
  debounceStartedAt: number;
  lastSentText: string;
  isComposing: boolean;
}

export interface AssistantContext {
  editorControl: EditorControl;
  options: AssistantOptions;
  log(event: AssistEvent): void;
  getState(): AssistantState;
  setState(patch: Partial<AssistantState>): void;
  isReplacingWords: boolean;
  replacedFlashTimer?: ReturnType<typeof setTimeout>;
  ignoredWords: string[];
  customWords: Set<string>;
  spellCheck: SpellCheckData;
  typing: TypingData;
}
