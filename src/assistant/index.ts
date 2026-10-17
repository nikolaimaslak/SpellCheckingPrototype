import { INITIAL_STATE, type AssistantContext, type AssistantOptions, type AssistantState } from './types';
import * as checkWhileTyping from './typing/check-while-typing';
import { hideGhost } from './typing/ghost-text';
import * as spellCheck from './typing/spell-check';
import { trace } from './trace';

export type { AssistantOptions, AssistantState, AssistEvent } from './types';
export type Assistant = ReturnType<typeof createAssistant>;

export function createAssistant(field: HTMLElement, options: AssistantOptions) {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  const context: AssistantContext = {
    field,
    options,
    log: (event) => context.options.log(event),
    getState: () => state,
    setState(patch: Partial<AssistantState>) {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    isReplacingWords: false,
    ignoredWords: options.ignoredWords,
    customWords: new Set(options.customWords),
    spellCheck: {
      mistakes: [],
      replacementByOriginal: new Map(),
      undoneAutoCorrections: [],
    },
    typing: {
      debounceStartedAt: 0,
      lastSentText: '',
      isComposing: false,
    },
  };

  trace('assistant', 'attached to the field', {
    spellCheckMode: options.spellCheckMode,
    withAutoCompletion: options.withAutoCompletion,
    hasApiKey: !!options.apiKey,
  });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    handleInput: (event: InputEvent) => checkWhileTyping.handleInput(context, event),
    handleKeyDown: (event: KeyboardEvent) => checkWhileTyping.handleKeyDown(context, event),
    handleClick: () => checkWhileTyping.handleClick(context),
    handleSelectionChange: () => checkWhileTyping.handleSelectionChange(context),
    handleCompositionStart: () => checkWhileTyping.handleCompositionStart(context),
    handleCompositionEnd: () => checkWhileTyping.handleCompositionEnd(context),
    handleKeyUp: (event: KeyboardEvent) => checkWhileTyping.handleKeyUp(context, event),

    pickSuggestion: (suggestion: string) => spellCheck.pickSuggestion(context, suggestion),
    ignoreWord: () => spellCheck.ignoreWord(context),
    addToDictionary: (word: string) => spellCheck.addToDictionary(context, word),
    closePopover: (shouldReturnCaret: boolean) => spellCheck.closePopover(context, shouldReturnCaret),

    updateOptions(newOptions: AssistantOptions) {
      trace('assistant', 'settings changed', {
        spellCheckMode: newOptions.spellCheckMode,
        withAutoCompletion: newOptions.withAutoCompletion,
        hasApiKey: !!newOptions.apiKey,
      });
      context.options = newOptions;
      context.ignoredWords = newOptions.ignoredWords;
      context.customWords = new Set(newOptions.customWords);
      if (newOptions.spellCheckMode === 'off') {
        context.spellCheck.mistakes = [];
        spellCheck.stopSpellCheck(context);
      } else {
        spellCheck.redrawUnderlines(context);
      }
      if (!newOptions.withAutoCompletion) {
        hideGhost(context);
      }
    },

    release() {
      trace('assistant', 'released (the page is closing)');
      checkWhileTyping.stopCheckWhileTyping(context);
      spellCheck.stopSpellCheck(context);
      listeners.clear();
    },
  };
}
