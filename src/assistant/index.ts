import { INITIAL_STATE, type AssistantContext, type AssistantOptions, type AssistantState, type EditorControl, type KeyPress, type TextInput } from './types';
import * as checkWhileTyping from './check-while-typing';
import { hideAutoCompletion } from './auto-completion';
import * as spellCheck from './spell-check';

export type { AssistantOptions, AssistantState, AssistantEvent, ChatMessage, DebugArea, EditorControl, LLMClient, LLMResult, AutoCompletionState, KeyPress, PopoverState, TextDirection, TextInput, TextSpan } from './types';
export { INITIAL_STATE } from './types';
export type Assistant = ReturnType<typeof createAssistant>;

export function createAssistant(editorControl: EditorControl, options: AssistantOptions) {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  const context: AssistantContext = {
    editorControl,
    options,
    log: (event) => context.options.onEvent(event),
    debug: (area, message, details) =>
      context.options.onEvent({
        type: 'debug',
        area,
        message,
        details,
      }),
    getState: () => state,
    setState(patch: Partial<AssistantState>) {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    isAutoCorrecting: false,
    ignoredWords: options.ignoredWords,
    customDictionary: new Set(options.customDictionary),
    spellCheck: {
      mistakes: [],
      fixByOriginal: new Map(),
      undoneAutoCorrections: [],
    },
    typing: {
      debounceStartedAt: 0,
      lastSentText: '',
      isComposing: false,
    },
  };

  context.debug('assistant', 'attached to the field', {
    spellCheckMode: options.spellCheckMode,
    withAutoCompletion: options.withAutoCompletion,
  });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    handleInput: (event: TextInput) => checkWhileTyping.handleInput(context, event),
    handleKeyDown: (event: KeyPress) => checkWhileTyping.handleKeyDown(context, event),
    handleClick: () => checkWhileTyping.handleClick(context),
    handleSelectionChange: () => checkWhileTyping.handleSelectionChange(context),
    handleCompositionStart: () => checkWhileTyping.handleCompositionStart(context),
    handleCompositionEnd: () => checkWhileTyping.handleCompositionEnd(context),
    handleKeyUp: (event: KeyPress) => checkWhileTyping.handleKeyUp(context, event),

    pickFix: (fix: string) => spellCheck.pickFix(context, fix),
    ignoreWord: () => spellCheck.ignoreWord(context),
    addToDictionary: (word: string) => spellCheck.addToDictionary(context, word),
    closePopover: (shouldReturnCaret: boolean) => spellCheck.closePopover(context, shouldReturnCaret),

    updateOptions(newOptions: AssistantOptions) {
      context.debug('assistant', 'settings changed', {
        spellCheckMode: newOptions.spellCheckMode,
        withAutoCompletion: newOptions.withAutoCompletion,
      });
      context.options = newOptions;
      context.ignoredWords = newOptions.ignoredWords;
      context.customDictionary = new Set(newOptions.customDictionary);
      if (newOptions.spellCheckMode === 'off') {
        context.spellCheck.mistakes = [];
        spellCheck.stopSpellCheck(context);
      } else {
        spellCheck.redrawUnderlines(context);
      }
      if (!newOptions.withAutoCompletion) {
        hideAutoCompletion(context);
      }
    },

    release() {
      context.debug('assistant', 'release called');
      checkWhileTyping.stopCheckWhileTyping(context);
      spellCheck.stopSpellCheck(context);
      listeners.clear();
    },
  };
}
