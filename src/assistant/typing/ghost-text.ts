import { caretRange, isMac, replaceText } from '../browser';
import { caretOffset, readFieldText } from '../text/field-text';
import { directionOfLastWord } from '../text/words';
import type { AssistantContext, ShownGhost } from '../types';
import { ghostKeyAction, nextWord } from './ghost-text-rules';
import { trace } from '../trace';

export function showGhost(context: AssistantContext, completion: string, atCaretOffset: number, textBeforeCaret: string) {
  if (!completion) {
    trace('ghost', 'the model has no completion for this place');
    return;
  }
  trace('ghost', `showing ${JSON.stringify(completion)} after the caret`);
  const ghost: ShownGhost = {
    remainingText: completion,
    caretOffset: atCaretOffset,
    fieldText: readFieldText(context.field).text,
    direction: directionOfLastWord(textBeforeCaret),
  };
  context.ghost = ghost;
  redrawGhost(context);
}

export function redrawGhost(context: AssistantContext) {
  const { ghost, field } = context;
  if (!ghost || !field.contains(document.activeElement)) {
    if (context.getState().ghost) context.setState({ ghost: undefined });
    return;
  }
  context.setState({ ghost: { text: ghost.remainingText, direction: ghost.direction } });
}

export function hideGhost(context: AssistantContext) {
  if (!context.ghost) {
    return;
  }
  trace('ghost', 'hidden');
  context.ghost = undefined;
  redrawGhost(context);
}

export function hideGhostIfCaretMoved(context: AssistantContext) {
  if (context.ghost && caretOffset(readFieldText(context.field)) !== context.ghost.caretOffset) {
    hideGhost(context);
  }
}

function acceptAll(context: AssistantContext, ghost: ShownGhost) {
  const caret = caretRange();
  if (!caret) {
    return;
  }
  trace('ghost', `accepted ${JSON.stringify(ghost.remainingText)} (one undo step)`);
  hideGhost(context);
  replaceText(context.field, caret, ghost.remainingText);
  context.log({ type: 'completion-accepted', text: ghost.remainingText });
}

function acceptNextWord(context: AssistantContext, ghost: ShownGhost) {
  const caret = caretRange();
  if (!caret) {
    return;
  }
  trace('ghost', `accepting the next word ${JSON.stringify(nextWord(ghost.remainingText))}`);
  replaceText(context.field, caret, nextWord(ghost.remainingText));
}

function followDeletedSpaces(context: AssistantContext, ghost: ShownGhost): boolean {
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
  ghost.caretOffset = caret;
  ghost.fieldText = now.text;
  trace('ghost', 'backspace removed only spaces: the ghost text moves to the caret');
  redrawGhost(context);
  return true;
}

export function ghostFollowsTyping(context: AssistantContext, event: InputEvent): boolean {
  const { ghost } = context;
  if (!ghost) {
    return false;
  }
  if (event.inputType === 'deleteContentBackward') {
    return followDeletedSpaces(context, ghost);
  }
  if (event.inputType !== 'insertText' || !event.data || !ghost.remainingText.startsWith(event.data)) {
    return false;
  }
  const fieldText = readFieldText(context.field);
  const caretAfterTyping = caretOffset(fieldText);
  if (caretAfterTyping !== ghost.caretOffset + event.data.length) {
    return false;
  }
  ghost.remainingText = ghost.remainingText.slice(event.data.length);
  ghost.caretOffset = caretAfterTyping;
  ghost.fieldText = fieldText.text;
  trace('ghost', `typed what the ghost text said: ${JSON.stringify(ghost.remainingText)} left`);
  if (ghost.remainingText) redrawGhost(context);
  else hideGhost(context);
  return true;
}

export function handleGhostKey(context: AssistantContext, event: KeyboardEvent) {
  const { ghost, field } = context;
  const focused = document.activeElement;
  if (!ghost || !focused || !field.contains(focused)) {
    return;
  }
  const action = ghostKeyAction(event, ghost.direction, isMac);
  if (action === 'none') {
    return;
  }
  trace('ghost', `key ${event.key}: ${action}`);
  event.preventDefault();
  event.stopImmediatePropagation();
  if (action === 'accept-all') acceptAll(context, ghost);
  else if (action === 'accept-word') acceptNextWord(context, ghost);
  else hideGhost(context);
}
