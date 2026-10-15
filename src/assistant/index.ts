import { createPolish } from './polish/polish';
import { INITIAL_STATE, type AssistantContext, type AssistantOptions, type AssistantState } from './types';
import { createTypingAssist } from './typing/typing-assist';
import { trace } from './trace';

export type { AssistantOptions, AssistantState, AssistEvent } from './types';
export type Assistant = ReturnType<typeof createAssistant>;

export function createAssistant(field: HTMLElement, options: AssistantOptions) {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  const context: AssistantContext = {
    field,
    log: (event) => options.log?.(event),
    getState: () => state,
    setState(patch: Partial<AssistantState>) {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
  };

  trace('assistant', 'attached to the field', { spelling: options.spelling, completion: options.completion, hasApiKey: !!options.apiKey });
  const typingAssist = options.spelling !== 'off' || options.completion ? createTypingAssist(context, options) : undefined;
  const polish = createPolish(context, { ...options, beforeRequest: () => typingAssist?.closePanels() });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    handleInput(event: InputEvent) {
      typingAssist?.handleInput(event);
      polish.handleFieldChanged();
    },
    handleKeyDown: (event: KeyboardEvent) => typingAssist?.handleKeyDown(event),
    handleClick: () => typingAssist?.handleClick(),
    handleSelectionChange: () => typingAssist?.handleSelectionChange(),
    handleCompositionStart: () => typingAssist?.handleCompositionStart(),
    handleCompositionEnd: () => typingAssist?.handleCompositionEnd(),
    handleFocusChange: () => typingAssist?.handleFocusChange(),
    handleKeyUp: (event: KeyboardEvent) => typingAssist?.handleKeyUp(event),
    handleCleared() {
      typingAssist?.handleCleared();
      polish.handleFieldChanged();
    },

    pickSuggestion: (suggestion: string) => typingAssist?.pickSuggestion(suggestion),
    ignoreWord: () => typingAssist?.ignoreWord(),
    closePopover: (returnCaret: boolean) => typingAssist?.closePopover(returnCaret),
    polishNow: () => polish.polishNow(),
    acceptPolish: () => polish.accept(),
    dismissPolish: () => polish.dismiss(),

    release() {
      trace('assistant', 'released (settings changed or the page is closing)');
      typingAssist?.release();
      polish.release();
      listeners.clear();
    },
  };
}
