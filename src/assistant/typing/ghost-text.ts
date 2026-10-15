import { caretRange, caretRect, contentRect, isMac, replaceText } from '../browser';
import { caretOffset, readFieldText } from '../text/field-text';
import { directionOfLastWord } from '../text/words';
import type { AssistantContext, TextDirection } from '../types';
import { ghostKeyAction, ghostLayout, nextWord } from './ghost-text-rules';

export function createGhostText(context: AssistantContext) {
  const { field, log } = context;
  let shown: { remainingText: string; caretOffset: number; direction: TextDirection } | undefined;

  const currentCaretOffset = () => caretOffset(readFieldText(field));

  function show(completion: string, atCaretOffset: number, textBeforeCaret: string) {
    if (!completion) return;
    shown = { remainingText: completion, caretOffset: atCaretOffset, direction: directionOfLastWord(textBeforeCaret) };
    redraw();
  }

  function redraw() {
    if (!shown) {
      if (context.getState().ghost) context.setState({ ghost: undefined });
      return;
    }
    const style = getComputedStyle(field);
    const fieldStyle = { font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, direction: style.direction };
    const layout = ghostLayout(caretRect(field), contentRect(field), fieldStyle, shown.direction);
    context.setState({ ghost: { text: shown.remainingText, layout } });
  }

  function hide() {
    if (!shown) return;
    shown = undefined;
    redraw();
  }

  function hideIfCaretMoved() {
    if (shown && currentCaretOffset() !== shown.caretOffset) hide();
  }

  function acceptAll() {
    const caret = caretRange();
    if (!shown || !caret) return;
    const acceptedText = shown.remainingText;
    hide();
    replaceText(field, caret, acceptedText);
    log({ type: 'completion-accepted', text: acceptedText });
  }

  function acceptNextWord() {
    const caret = caretRange();
    if (shown && caret) replaceText(field, caret, nextWord(shown.remainingText));
  }

  function continueTyping(event: InputEvent): boolean {
    if (!shown || event.inputType !== 'insertText' || !event.data) return false;
    if (!shown.remainingText.startsWith(event.data)) return false;
    const caretAfterTyping = currentCaretOffset();
    if (caretAfterTyping !== shown.caretOffset + event.data.length) return false;
    shown.remainingText = shown.remainingText.slice(event.data.length);
    shown.caretOffset = caretAfterTyping;
    if (shown.remainingText) redraw();
    else hide();
    return true;
  }

  function handleKey(event: KeyboardEvent) {
    const focused = document.activeElement;
    if (!shown || !focused || !field.contains(focused)) return;
    const action = ghostKeyAction(event, shown.direction, isMac);
    if (action === 'none') return;
    if (action === 'dismiss') {
      hide();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action === 'accept-all') acceptAll();
    else if (action === 'accept-word') acceptNextWord();
    else hide();
  }

  return {
    show,
    hide,
    redraw,
    hideIfCaretMoved,
    continueTyping,
    handleKey,
    isShown: () => !!shown,
  };
}
