import { caretRange, isMac, replaceText } from '../browser';
import { caretOffset, readFieldText } from '../text/field-text';
import { directionOfLastWord } from '../text/words';
import type { AssistantContext, GhostState, TextDirection } from '../types';
import { trace } from '../trace';

type GhostKeyAction = 'accept-all' | 'accept-word' | 'escape' | 'none';

function ghostKeyAction(event: KeyboardEvent, direction: TextDirection): GhostKeyAction {
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

export function showGhost(context: AssistantContext, completion: string, atCaretOffset: number) {
  if (!completion) {
    trace('ghost', 'the model has no completion for this place');
    return;
  }
  trace('ghost', `showing ${JSON.stringify(completion)} after the caret`);
  const fieldText = readFieldText(context.field).text;
  const ghost: GhostState = {
    text: completion,
    caretOffset: atCaretOffset,
    fieldText,
    direction: directionOfLastWord(fieldText),
  };
  context.setState({ ghost });
}

export function hideGhost(context: AssistantContext) {
  if (!context.getState().ghost) {
    return;
  }
  trace('ghost', 'hidden');
  context.setState({ ghost: undefined });
}

export function hideGhostIfCaretMoved(context: AssistantContext) {
  const ghost = context.getState().ghost;
  if (ghost && caretOffset(readFieldText(context.field)) !== ghost.caretOffset) {
    hideGhost(context);
  }
}

function acceptAll(context: AssistantContext, ghost: GhostState) {
  const caret = caretRange();
  if (!caret) {
    return;
  }
  trace('ghost', `accepted ${JSON.stringify(ghost.text)} (one undo step)`);
  hideGhost(context);
  replaceText(context.field, caret, ghost.text);
  context.log({ type: 'auto-completion-accepted', text: ghost.text });
}

function acceptNextWord(context: AssistantContext, ghost: GhostState) {
  const caret = caretRange();
  if (!caret) {
    return;
  }
  trace('ghost', `accepting the next word ${JSON.stringify(nextWord(ghost.text))}`);
  replaceText(context.field, caret, nextWord(ghost.text));
}

function followDeletedSpaces(context: AssistantContext, ghost: GhostState): boolean {
  const now = readFieldText(context.field);
  const caret = caretOffset(now);
  if (caret === undefined || caret >= ghost.caretOffset) {
    return false;
  }
  const before = ghost.fieldText;
  const deleted = before.slice(caret, ghost.caretOffset);
  if (before.slice(0, caret) + before.slice(ghost.caretOffset) !== now.text || deleted.trim()) {
    return false;
  }
  trace('ghost', 'backspace removed only spaces: the ghost text moves to the caret');
  context.setState({
    ghost: {
      ...ghost,
      caretOffset: caret,
      fieldText: now.text,
    },
  });
  return true;
}

function followNewLine(context: AssistantContext, ghost: GhostState): boolean {
  const textNow = readFieldText(context.field);
  const caretNow = caretOffset(textNow);
  if (caretNow === undefined || caretNow <= ghost.caretOffset) {
    return false;
  }
  const textWhenGhostShown = ghost.fieldText;
  const typedSinceGhostShown = textNow.text.slice(ghost.caretOffset, caretNow);
  const textIfOnlyTypedAtGhost = textWhenGhostShown.slice(0, ghost.caretOffset) + typedSinceGhostShown + textWhenGhostShown.slice(ghost.caretOffset);
  const isAddedOnlyAtGhost = textIfOnlyTypedAtGhost === textNow.text;
  const isAddedOnlyNewLines = typedSinceGhostShown.trim() === '';
  if (!isAddedOnlyAtGhost || !isAddedOnlyNewLines) {
    return false;
  }
  const ghostTextWithoutLeadingSpacesAndCommas = ghost.text.replace(/^[\s,،]+/u, '');
  if (!ghostTextWithoutLeadingSpacesAndCommas) {
    return false;
  }
  trace('ghost', `new line: the ghost text moves to it as ${JSON.stringify(ghostTextWithoutLeadingSpacesAndCommas)}`);
  context.setState({
    ghost: {
      ...ghost,
      text: ghostTextWithoutLeadingSpacesAndCommas,
      caretOffset: caretNow,
      fieldText: textNow.text,
    },
  });
  return true;
}

export function ghostFollowsTyping(context: AssistantContext, event: InputEvent): boolean {
  const ghost = context.getState().ghost;
  if (!ghost) {
    return false;
  }
  if (event.inputType === 'deleteContentBackward') {
    return followDeletedSpaces(context, ghost);
  }
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
    return followNewLine(context, ghost);
  }
  if (event.inputType !== 'insertText' || !event.data || !ghost.text.startsWith(event.data)) {
    return false;
  }
  const fieldText = readFieldText(context.field);
  const caretAfterTyping = caretOffset(fieldText);
  if (caretAfterTyping !== ghost.caretOffset + event.data.length) {
    trace('ghost', `typed text matches the ghost, but the caret is at ${caretAfterTyping}, not ${ghost.caretOffset} + ${event.data.length}: hidden`, {
      textWhenShown: ghost.fieldText,
      textNow: fieldText.text,
    });
    return false;
  }
  const remainingText = ghost.text.slice(event.data.length);
  trace('ghost', `typed what the ghost text said: ${JSON.stringify(remainingText)} left`);
  if (remainingText) {
    context.setState({
      ghost: {
        ...ghost,
        text: remainingText,
        caretOffset: caretAfterTyping,
        fieldText: fieldText.text,
      },
    });
  } else {
    hideGhost(context);
  }
  return true;
}

export function handleGhostKey(context: AssistantContext, event: KeyboardEvent) {
  const ghost = context.getState().ghost;
  if (!ghost) {
    return;
  }
  const action = ghostKeyAction(event, ghost.direction);
  if (action === 'none') {
    return;
  }
  trace('ghost', `key ${event.key}: ${action}`);
  event.preventDefault();
  event.stopImmediatePropagation();
  if (action === 'accept-all') {
    acceptAll(context, ghost);
  } else if (action === 'accept-word') {
    acceptNextWord(context, ghost);
  } else {
    hideGhost(context);
  }
}
