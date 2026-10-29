import { directionOfLastWord } from './words';
import type { AssistantContext, AutoCompletionState, KeyPress, TextDirection, TextInput } from './types';

type AutoCompletionKeyAction = 'accept-all' | 'accept-word' | 'escape' | 'none';

function autoCompletionKeyAction(event: KeyPress, direction: TextDirection, isMac: boolean): AutoCompletionKeyAction {
  const forwardArrow = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const hasNoModifiers = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  const isWordJumpPressed = isMac ? event.altKey && !event.ctrlKey : event.ctrlKey && !event.altKey;

  if (event.key === 'Tab') {
    return hasNoModifiers ? 'accept-all' : 'none';
  }
  if (event.key === 'Escape') {
    return 'escape';
  }
  if (event.key === forwardArrow) {
    if (hasNoModifiers) {
      return 'accept-all';
    }
    return isWordJumpPressed && !event.shiftKey && !event.metaKey ? 'accept-word' : 'none';
  }
  return 'none';
}

function nextWord(text: string): string {
  return /^\s*\S+/u.exec(text)?.[0] ?? text;
}

export function showAutoCompletion(context: AssistantContext, text: string, atCaretOffset: number) {
  if (!text) {
    context.debug('auto-completion', 'the model has no auto-completion for this place');
    return;
  }
  context.debug('auto-completion', `showing ${JSON.stringify(text)} after the caret`);
  const textWhenShown = context.editorControl.getText();
  const autoCompletion: AutoCompletionState = {
    text,
    caretOffset: atCaretOffset,
    textWhenShown,
    direction: directionOfLastWord(textWhenShown),
  };
  context.setState({ autoCompletion });
}

export function hideAutoCompletion(context: AssistantContext) {
  if (!context.getState().autoCompletion) {
    return;
  }
  context.debug('auto-completion', 'hidden');
  context.setState({ autoCompletion: undefined });
}

export function keepAutoCompletionAfterAutoCorrection(context: AssistantContext, caretShift: number) {
  const autoCompletion = context.getState().autoCompletion;
  if (!autoCompletion) {
    return;
  }
  context.debug('auto-completion', `kept after the auto-correction, caret ${autoCompletion.caretOffset} → ${autoCompletion.caretOffset + caretShift}`);
  context.setState({
    autoCompletion: {
      ...autoCompletion,
      caretOffset: autoCompletion.caretOffset + caretShift,
      textWhenShown: context.editorControl.getText(),
    },
  });
}

export function hideAutoCompletionIfCaretMoved(context: AssistantContext) {
  const autoCompletion = context.getState().autoCompletion;
  if (autoCompletion && context.editorControl.getCaret() !== autoCompletion.caretOffset) {
    hideAutoCompletion(context);
  }
}

function acceptAll(context: AssistantContext, autoCompletion: AutoCompletionState) {
  const caret = context.editorControl.getCaret();
  if (caret === undefined) {
    return;
  }
  context.debug('auto-completion', `accepted ${JSON.stringify(autoCompletion.text)} (one undo step)`);
  hideAutoCompletion(context);
  context.editorControl.replaceText(caret, caret, autoCompletion.text);
}

function acceptNextWord(context: AssistantContext, autoCompletion: AutoCompletionState) {
  const caret = context.editorControl.getCaret();
  if (caret === undefined) {
    return;
  }
  context.debug('auto-completion', `accepting the next word ${JSON.stringify(nextWord(autoCompletion.text))}`);
  context.editorControl.replaceText(caret, caret, nextWord(autoCompletion.text));
}

function followDeletedSpaces(context: AssistantContext, autoCompletion: AutoCompletionState): boolean {
  const textNow = context.editorControl.getText();
  const caret = context.editorControl.getCaret();
  if (caret === undefined || caret >= autoCompletion.caretOffset) {
    return false;
  }
  const before = autoCompletion.textWhenShown;
  const deleted = before.slice(caret, autoCompletion.caretOffset);
  if (before.slice(0, caret) + before.slice(autoCompletion.caretOffset) !== textNow || deleted.trim()) {
    return false;
  }
  context.debug('auto-completion', 'backspace removed only spaces: the auto-completion moves to the caret');
  context.setState({
    autoCompletion: {
      ...autoCompletion,
      caretOffset: caret,
      textWhenShown: textNow,
    },
  });
  return true;
}

function followNewLine(context: AssistantContext, autoCompletion: AutoCompletionState): boolean {
  const textNow = context.editorControl.getText();
  const caretNow = context.editorControl.getCaret();
  if (caretNow === undefined || caretNow <= autoCompletion.caretOffset) {
    return false;
  }
  const textWhenShown = autoCompletion.textWhenShown;
  const typedSinceShown = textNow.slice(autoCompletion.caretOffset, caretNow);
  const textIfOnlyTypedAtAutoCompletion = textWhenShown.slice(0, autoCompletion.caretOffset) + typedSinceShown + textWhenShown.slice(autoCompletion.caretOffset);
  const isAddedOnlyAtAutoCompletion = textIfOnlyTypedAtAutoCompletion === textNow;
  const isAddedOnlyNewLines = typedSinceShown.trim() === '';
  if (!isAddedOnlyAtAutoCompletion || !isAddedOnlyNewLines) {
    return false;
  }
  const textWithoutLeadingSpacesAndCommas = autoCompletion.text.replace(/^[\s,،]+/u, '');
  if (!textWithoutLeadingSpacesAndCommas) {
    return false;
  }
  context.debug('auto-completion', `new line: the auto-completion moves to it as ${JSON.stringify(textWithoutLeadingSpacesAndCommas)}`);
  context.setState({
    autoCompletion: {
      ...autoCompletion,
      text: textWithoutLeadingSpacesAndCommas,
      caretOffset: caretNow,
      textWhenShown: textNow,
    },
  });
  return true;
}

export function autoCompletionFollowsTyping(context: AssistantContext, event: TextInput): boolean {
  const autoCompletion = context.getState().autoCompletion;
  if (!autoCompletion) {
    return false;
  }
  if (event.inputType === 'deleteContentBackward') {
    return followDeletedSpaces(context, autoCompletion);
  }
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
    return followNewLine(context, autoCompletion);
  }
  if (event.inputType !== 'insertText' || !event.data || !autoCompletion.text.startsWith(event.data)) {
    return false;
  }
  const textNow = context.editorControl.getText();
  const caretAfterTyping = context.editorControl.getCaret();
  if (caretAfterTyping !== autoCompletion.caretOffset + event.data.length) {
    context.debug('auto-completion', `typed text matches the auto-completion, but the caret is at ${caretAfterTyping}, not ${autoCompletion.caretOffset} + ${event.data.length}: hidden`, {
      textWhenShown: autoCompletion.textWhenShown,
      textNow,
    });
    return false;
  }
  const remainingText = autoCompletion.text.slice(event.data.length);
  context.debug('auto-completion', `typed what the auto-completion said: ${JSON.stringify(remainingText)} left`);
  if (remainingText) {
    context.setState({
      autoCompletion: {
        ...autoCompletion,
        text: remainingText,
        caretOffset: caretAfterTyping,
        textWhenShown: textNow,
      },
    });
  } else {
    hideAutoCompletion(context);
  }
  return true;
}

export function handleAutoCompletionKey(context: AssistantContext, event: KeyPress): boolean {
  const autoCompletion = context.getState().autoCompletion;
  if (!autoCompletion) {
    return false;
  }
  const action = autoCompletionKeyAction(event, autoCompletion.direction, context.options.isMac);
  if (action === 'none') {
    return false;
  }
  context.debug('auto-completion', `key ${event.key}: ${action}`);
  if (action === 'accept-all') {
    acceptAll(context, autoCompletion);
  } else if (action === 'accept-word') {
    acceptNextWord(context, autoCompletion);
  } else {
    hideAutoCompletion(context);
  }
  return true;
}
