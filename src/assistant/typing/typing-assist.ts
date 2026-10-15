import { requestCheck } from '../openai/check-request';
import { caretOffset, readFieldText } from '../text/field-text';
import type { AssistantContext, AssistantOptions } from '../types';
import { createGhostText } from './ghost-text';
import { isGoodMomentForCompletion } from './ghost-text-rules';
import { createSpelling } from './spelling';

const MIN_MS_BETWEEN_REQUESTS = 1000;

const isPopoverShortcut = (event: KeyboardEvent) =>
  event.key === '.' && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;

export function createTypingAssist(context: AssistantContext, options: AssistantOptions) {
  const { field, log } = context;
  const spelling =
    options.spelling === 'off'
      ? undefined
      : createSpelling(context, { autoCorrect: options.spelling === 'auto', customWords: options.customWords, conversation: options.conversation });
  const ghostText = options.completion ? createGhostText(context) : undefined;

  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRequestAt = -Infinity;
  let runningRequest: AbortController | undefined;
  let isComposing = false;
  let isReleased = false;

  const isPanelOpen = () => !!spelling?.isPopoverOpen() || !!context.getState().polish.preview;

  function scheduleRequest() {
    if (isReleased || requestTimer) return;
    const waitMs = Math.max(0, lastRequestAt + MIN_MS_BETWEEN_REQUESTS - Date.now());
    requestTimer = setTimeout(() => void sendRequestNow(), waitMs);
  }

  async function sendRequestNow() {
    clearTimeout(requestTimer);
    requestTimer = undefined;
    const sentText = readFieldText(field);
    const caret = caretOffset(sentText);
    if (isReleased || !sentText.text.trim()) return;
    const textBeforeCaret = caret !== undefined && wantsCompletionAt(sentText.text, caret) ? sentText.text.slice(0, caret) : null;

    lastRequestAt = Date.now();
    runningRequest?.abort();
    const request = new AbortController();
    runningRequest = request;
    log({ type: 'check-request', text: sentText.text, completion: textBeforeCaret !== null });
    const answer = await requestCheck(
      options.apiKey,
      {
        draft: sentText.text,
        textBeforeCaret,
        conversation: options.conversation(),
        cannedResponses: options.canned,
        articles: options.kb,
        customWords: options.customWords,
      },
      request.signal,
    );
    if (isReleased || request.signal.aborted) return;
    runningRequest = undefined;
    log({ type: 'check-reply', reply: answer });
    if (!answer) return;

    spelling?.applyMistakes(answer.mistakes);
    const currentText = readFieldText(field);
    const nothingMoved = currentText.text === sentText.text && caretOffset(currentText) === caret;
    if (textBeforeCaret !== null && nothingMoved && !isPanelOpen()) ghostText?.show(answer.completion, caret!, textBeforeCaret);
  }

  function wantsCompletionAt(text: string, caret: number): boolean {
    if (!ghostText || ghostText.isShown()) return false;
    return isGoodMomentForCompletion({
      textBeforeCaret: text.slice(0, caret),
      restOfLine: text.slice(caret).split('\n')[0],
      isComposing,
      isPanelOpen: isPanelOpen(),
    });
  }

  function openPopover(): boolean {
    const opened = !!spelling?.openPopoverAtCaret();
    if (opened) ghostText?.hide();
    return opened;
  }

  function closePanels() {
    ghostText?.hide();
    spelling?.closePopover();
  }

  function handleInput(event: InputEvent) {
    if (event.inputType === 'historyUndo') spelling?.noticeUndo();
    if (!ghostText?.continueTyping(event)) ghostText?.hide();
    spelling?.redrawUnderlines();
    scheduleRequest();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (isPopoverShortcut(event) && openPopover()) {
      event.preventDefault();
      return;
    }
    ghostText?.handleKey(event);
  }

  function handleClick() {
    setTimeout(openPopover, 0);
  }

  function handleSelectionChange() {
    const anchor = document.getSelection()?.anchorNode;
    if (!anchor || !field.contains(anchor)) return;
    ghostText?.hideIfCaretMoved();
    spelling?.redrawUnderlines();
  }

  function handleCompositionStart() {
    isComposing = true;
    ghostText?.hide();
  }

  function handleCompositionEnd() {
    isComposing = false;
  }

  function handleBlur() {
    ghostText?.hide();
  }

  function handleLayoutChange() {
    ghostText?.redraw();
  }

  function handleCleared() {
    ghostText?.hide();
    spelling?.redrawUnderlines();
  }

  function release() {
    isReleased = true;
    clearTimeout(requestTimer);
    runningRequest?.abort();
    ghostText?.hide();
    spelling?.release();
  }

  return {
    handleInput,
    handleKeyDown,
    handleClick,
    handleSelectionChange,
    handleCompositionStart,
    handleCompositionEnd,
    handleBlur,
    handleLayoutChange,
    handleCleared,
    closePanels,
    closePopover: (returnCaret: boolean) => spelling?.closePopover(returnCaret),
    pickSuggestion: (suggestion: string) => spelling?.pickSuggestion(suggestion),
    ignoreWord: () => spelling?.ignoreWord(),
    release,
  };
}
