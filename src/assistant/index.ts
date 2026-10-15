import { createPolish } from './polish/polish';
import { INITIAL_STATE, type AssistantContext, type AssistantOptions, type AssistantState } from './types';
import { createTypingAssist } from './typing/typing-assist';

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
    handleBlur: () => typingAssist?.handleBlur(),
    handleLayoutChange: () => typingAssist?.handleLayoutChange(),
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
      typingAssist?.release();
      polish.release();
      listeners.clear();
    },
  };
}
