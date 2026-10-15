import { caretRange, isMac, replaceText } from '../browser';
import { caretOffset, readFieldText } from '../text/field-text';
import { directionOfLastWord } from '../text/words';
import type { AssistantContext, GhostState, TextDirection } from '../types';
import { trace } from '../trace';

type GhostKeyAction = 'accept-all' | 'accept-word' | 'escape' | 'none';

function ghostKeyAction(event: KeyboardEvent, direction: TextDirection): GhostKeyAction {
  const forwardArrow = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const noModifiers = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  const wordJumpModifier = isMac ? event.altKey && !event.ctrlKey : event.ctrlKey && !event.altKey;

  if (event.key === 'Tab') {
    return noModifiers ? 'accept-all' : 'none';
  }
  if (event.key === 'Escape') {
    return 'escape';
  }
  if (event.key === forwardArrow) {
    if (noModifiers) {
      return 'accept-all';
    }
    return wordJumpModifier && !event.shiftKey && !event.metaKey ? 'accept-word' : 'none';
  }
  return 'none';
}

function nextWord(text: string): string {
  return /^\s*\S+/u.exec(text)?.[0] ?? text;
}

export function showGhost(context: AssistantContext, completion: string, atCaretOffset: number, textBeforeCaret: string) {
  if (!completion) {
    trace('ghost', 'the model has no completion for this place');
    return;
  }
  trace('ghost', `showing ${JSON.stringify(completion)} after the caret`);
  const ghost: GhostState = {
    text: completion,
    caretOffset: atCaretOffset,
    fieldText: readFieldText(context.field).text,
    direction: directionOfLastWord(textBeforeCaret),
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
  context.log({ type: 'completion-accepted', text: ghost.text });
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
  context.setState({ ghost: { ...ghost, caretOffset: caret, fieldText: now.text } });
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
  if (event.inputType !== 'insertText' || !event.data || !ghost.text.startsWith(event.data)) {
    return false;
  }
  const fieldText = readFieldText(context.field);
  const caretAfterTyping = caretOffset(fieldText);
  if (caretAfterTyping !== ghost.caretOffset + event.data.length) {
    return false;
  }
  const remainingText = ghost.text.slice(event.data.length);
  trace('ghost', `typed what the ghost text said: ${JSON.stringify(remainingText)} left`);
  if (remainingText) {
    context.setState({ ghost: { ...ghost, text: remainingText, caretOffset: caretAfterTyping, fieldText: fieldText.text } });
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
