import { acceptPolish, dismissPolish, polishNow, stopPolish } from './polish/polish';
import { INITIAL_STATE, type AssistantContext, type AssistantOptions, type AssistantState } from './types';
import * as checkWhileTyping from './typing/check-while-typing';
import { handleGhostKey } from './typing/ghost-text';
import * as spelling from './typing/spelling';
import { trace } from './trace';

export type { AssistantOptions, AssistantState, AssistEvent } from './types';
export type Assistant = ReturnType<typeof createAssistant>;

export function createAssistant(field: HTMLElement, options: AssistantOptions) {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  const context: AssistantContext = {
    field,
    options,
    log: options.log,
    getState: () => state,
    setState(patch: Partial<AssistantState>) {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    isReplacingWords: false,
    ignoredWords: options.ignoredWords,
    customWords: new Set(options.customWords),
    spelling: { mistakes: [], replacementByOriginal: new Map() },
    typing: { pauseStartedAt: 0, lastSentText: '', isComposing: false },
    polish: {},
  };

  trace('assistant', 'attached to the field', { spelling: options.spelling, completion: options.completion, hasApiKey: !!options.apiKey });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    handleInput: (event: InputEvent) => checkWhileTyping.handleInput(context, event),
    handleKeyDown: (event: KeyboardEvent) => handleGhostKey(context, event),
    handleClick: () => checkWhileTyping.handleClick(context),
    handleSelectionChange: () => checkWhileTyping.handleSelectionChange(context),
    handleCompositionStart: () => checkWhileTyping.handleCompositionStart(context),
    handleCompositionEnd: () => checkWhileTyping.handleCompositionEnd(context),
    handleKeyUp: (event: KeyboardEvent) => checkWhileTyping.handleKeyUp(context, event),

    pickSuggestion: (suggestion: string) => spelling.pickSuggestion(context, suggestion),
    ignoreWord: () => spelling.ignoreWord(context),
    addToDictionary: (word: string) => spelling.addToDictionary(context, word),
    closePopover: (returnCaret: boolean) => spelling.closePopover(context, returnCaret),
    polishNow: () => polishNow(context),
    acceptPolish: () => acceptPolish(context),
    dismissPolish: () => dismissPolish(context),

    release() {
      trace('assistant', 'released (settings changed or the page is closing)');
      checkWhileTyping.stopCheckWhileTyping(context);
      spelling.stopSpelling(context);
      stopPolish(context);
      listeners.clear();
    },
  };
}
