import { requestCheck } from '../openai/check-request';
import { caretOffset, readFieldText } from '../text/field-text';
import type { AssistantContext, AssistantOptions } from '../types';
import { createGhostText } from './ghost-text';
import { createSpelling } from './spelling';
import { trace } from '../trace';

const PAUSE_BEFORE_REQUEST_MS = 700;
const MIN_WORDS_IN_SENTENCE = 3;
const SENTENCE_END = /[.!?؟\n]/u;

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
  let runningRequest: AbortController | undefined;
  let changedDuringRequest = false;
  let lastSentText = '';
  let isComposing = false;
  let isReleased = false;

  const isPanelOpen = () => !!spelling?.isPopoverOpen() || !!context.getState().polish.preview;

  function updateIsChecking() {
    const isChecking = !!runningRequest;
    if (context.getState().isChecking === isChecking) {
      return;
    }
    trace('typing', `loader ${isChecking ? 'on' : 'off'}`);
    context.setState({ isChecking });
  }

  function scheduleRequest() {
    if (runningRequest) {
      changedDuringRequest = true;
      trace('typing', 'text changed while a request is running: will send again after its answer');
    }
    if (isReleased || runningRequest) {
      return;
    }
    trace('typing', requestTimer ? `typing continues: pause timer restarted (${PAUSE_BEFORE_REQUEST_MS} ms)` : `pause timer started: request in ${PAUSE_BEFORE_REQUEST_MS} ms unless typing continues`);
    clearTimeout(requestTimer);
    requestTimer = setTimeout(() => void sendRequestNow(), PAUSE_BEFORE_REQUEST_MS);
    updateIsChecking();
  }

  async function sendRequestNow() {
    clearTimeout(requestTimer);
    requestTimer = undefined;
    const sentText = readFieldText(field);
    const caret = caretOffset(sentText);
    lastSentText = sentText.text;
    if (isReleased || !sentText.text.trim()) {
      trace('typing', 'pause over, but the field is empty: nothing to send');
      updateIsChecking();
      return;
    }
    const noCompletionReason = whyNoCompletion(sentText.text, caret);
    const textBeforeCaret = noCompletionReason === null ? sentText.text.slice(0, caret) : null;
    trace('typing', `pause over: sending the draft${noCompletionReason === null ? ' (spelling + completion after the caret)' : ` (no completion: ${noCompletionReason})`}`, {
      draft: sentText.text,
      caret,
    });

    const request = new AbortController();
    runningRequest = request;
    updateIsChecking();
    log({ type: 'send-to-llm', text: sentText.text, completion: textBeforeCaret !== null });
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
    if (isReleased || request.signal.aborted) {
      trace('typing', 'answer dropped: the assistant was released meanwhile');
      return;
    }
    runningRequest = undefined;
    log({ type: 'llm-answer', reply: answer });

    if (!answer) trace('typing', 'no answer (no key, network error, timeout or unreadable JSON): nothing changes');
    if (answer) {
      const currentText = readFieldText(field);
      const nothingMoved = currentText.text === sentText.text && caretOffset(currentText) === caret;
      trace('typing', `answer: ${answer.mistakes.length} mistake(s), completion ${JSON.stringify(answer.completion)}; field ${nothingMoved ? 'unchanged' : 'changed'} since sending`);
      spelling?.applyMistakes(answer.mistakes);
      if (textBeforeCaret === null) trace('typing', 'no completion was asked for');
      else if (!nothingMoved) trace('typing', 'completion dropped: the text or the caret moved while waiting');
      else if (isPanelOpen()) trace('typing', 'completion dropped: the popover or the polish preview is open');
      else ghostText?.show(answer.completion, caret!, textBeforeCaret);
    }
    if (changedDuringRequest) {
      changedDuringRequest = false;
      trace('typing', 'the text changed while waiting: scheduling the next request');
      scheduleRequest();
    }
    updateIsChecking();
  }

  function whyNoCompletion(text: string, caret: number | undefined): string | null {
    if (!ghostText) {
      return 'inline completion is off';
    }
    if (ghostText.isShown()) {
      return 'a completion is already shown';
    }
    if (caret === undefined) {
      return 'the caret is not in the field (or text is selected)';
    }
    if (isComposing) {
      return 'an input method (IME) is composing';
    }
    if (isPanelOpen()) {
      return 'the popover or the polish preview is open';
    }
    const restOfLine = text.slice(caret).split('\n')[0];
    if (restOfLine.trim() !== '') {
      return 'there is text after the caret on this line';
    }
    const currentSentence = text.slice(0, caret).split(SENTENCE_END).at(-1) ?? '';
    const wordsInSentence = currentSentence.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (wordsInSentence.length < MIN_WORDS_IN_SENTENCE) {
      return `the current sentence has ${wordsInSentence.length} word(s), fewer than ${MIN_WORDS_IN_SENTENCE}`;
    }
    return null;
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
    trace('typing', `input: ${event.inputType}${event.data ? ` ${JSON.stringify(event.data)}` : ''}`);
    if (event.inputType === 'historyUndo') spelling?.noticeUndo();
    if (!ghostText?.continueTyping(event)) ghostText?.hide();
    spelling?.redrawUnderlines();
    if (event.inputType.startsWith('delete') && readFieldText(field).text.trimEnd() === lastSentText.trimEnd()) {
      trace('typing', 'only trailing spaces were removed since the last request: no new request');
      return;
    }
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
    if (!anchor || !field.contains(anchor)) {
      return;
    }
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
    trace('typing', 'field cleared by the page (message sent): pending request cancelled');
    clearTimeout(requestTimer);
    requestTimer = undefined;
    updateIsChecking();
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
