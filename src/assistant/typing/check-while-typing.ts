import { requestCheck } from '../llm/check-request';
import { caretOffset, readFieldText } from '../text/field-text';
import type { AssistantContext, AssistantState } from '../types';
import { ghostFollowsTyping, handleGhostKey, hideGhost, hideGhostIfCaretMoved, showGhost } from './ghost-text';
import { applyMistakes, closePopover, noticeUndo, openPopoverAtCaret, redrawUnderlines } from './spelling';
import { trace } from '../trace';

const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const MIN_WORDS_IN_SENTENCE = 3;
const SENTENCE_END = /[.!?؟\n]/u;

const isPanelOpen = (context: AssistantContext) => !!context.spelling.openPopover || !!context.getState().polish.preview;

function updateLoader(context: AssistantContext) {
  const { typing } = context;
  const loader: AssistantState['loader'] = typing.runningRequest
    ? { kind: 'request' }
    : typing.requestTimer
      ? { kind: 'pause', startedAt: typing.pauseStartedAt, durationMs: context.options.debounceMs }
      : undefined;
  if (JSON.stringify(context.getState().loader) === JSON.stringify(loader)) {
    return;
  }
  trace('typing', `loader ${loader?.kind ?? 'off'}`);
  context.setState({ loader });
}

function scheduleRequest(context: AssistantContext) {
  const { typing, options } = context;
  if (typing.runningRequest) {
    trace('typing', 'text changed while a request is running: it is aborted');
    typing.runningRequest.abort();
    typing.runningRequest = undefined;
  }
  if (options.spelling === 'off' && !options.completion) {
    trace('typing', 'spelling and completion are off: no request');
    return;
  }
  trace('typing', typing.requestTimer ? `typing continues: pause timer restarted (${options.debounceMs} ms)` : `pause timer started: request in ${options.debounceMs} ms unless typing continues`);
  clearTimeout(typing.requestTimer);
  typing.requestTimer = setTimeout(() => void sendRequestNow(context), options.debounceMs);
  typing.pauseStartedAt = Date.now();
  updateLoader(context);
}

async function sendRequestNow(context: AssistantContext) {
  const { typing, options, field } = context;
  clearTimeout(typing.requestTimer);
  typing.requestTimer = undefined;
  const sentText = readFieldText(field);
  const caret = caretOffset(sentText);
  typing.lastSentText = sentText.text;
  if (!sentText.text.trim()) {
    trace('typing', 'pause over, but the field is empty: nothing to send');
    updateLoader(context);
    return;
  }
  const noCompletionReason = whyNoCompletion(context, sentText.text, caret);
  const textBeforeCaret = noCompletionReason === null ? sentText.text.slice(0, caret) : null;
  trace('typing', `pause over: sending the draft${noCompletionReason === null ? ' (spelling + completion after the caret)' : ` (no completion: ${noCompletionReason})`}`, {
    draft: sentText.text,
    caret,
  });

  const request = new AbortController();
  typing.runningRequest = request;
  updateLoader(context);
  context.log({ type: 'send-to-llm', text: sentText.text, completion: textBeforeCaret !== null });
  const answer = await requestCheck(
    options.apiKey,
    {
      draft: sentText.text,
      textBeforeCaret,
      conversation: options.conversation,
      cannedResponses: options.canned,
      articles: options.kb,
      customWords: [...context.customWords],
      ignoredWords: context.ignoredWords,
    },
    request.signal,
  );
  if (request.signal.aborted) {
    trace('typing', 'answer dropped: the request was aborted');
    return;
  }
  typing.runningRequest = undefined;
  context.log({ type: 'llm-answer', reply: answer });

  if (answer) {
    const currentText = readFieldText(field);
    const nothingMoved = currentText.text === sentText.text && caretOffset(currentText) === caret;
    trace('typing', `answer: ${answer.mistakes.length} mistake(s), completion ${JSON.stringify(answer.completion)}; field ${nothingMoved ? 'unchanged' : 'changed'} since sending`);
    if (options.spelling !== 'off') {
      applyMistakes(context, answer.mistakes);
    }
    if (textBeforeCaret === null) {
      trace('typing', 'no completion was asked for');
    } else if (!nothingMoved) {
      trace('typing', 'completion dropped: the text or the caret moved while waiting');
    } else if (isPanelOpen(context)) {
      trace('typing', 'completion dropped: the popover or the polish preview is open');
    } else {
      showGhost(context, answer.completion, caret!, textBeforeCaret);
    }
  } else {
    trace('typing', 'no answer (no key, network error, timeout or unreadable JSON): nothing changes');
  }
  updateLoader(context);
}

function whyNoCompletion(context: AssistantContext, text: string, caret: number | undefined): string | null {
  if (!context.options.completion) {
    return 'inline completion is off';
  }
  if (caret === undefined) {
    return 'the caret is not in the field (or text is selected)';
  }
  if (context.typing.isComposing) {
    return 'an input method (IME) is composing';
  }
  if (isPanelOpen(context)) {
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

function openPopover(context: AssistantContext) {
  if (openPopoverAtCaret(context)) {
    hideGhost(context);
  }
}

export function closePanels(context: AssistantContext) {
  hideGhost(context);
  closePopover(context);
}

export function handleInput(context: AssistantContext, event: InputEvent) {
  trace('typing', `input: ${event.inputType}${event.data ? ` ${JSON.stringify(event.data)}` : ''}`);
  if (event.inputType === 'historyUndo') {
    noticeUndo(context);
  }
  if (!ghostFollowsTyping(context, event)) {
    hideGhost(context);
  }
  redrawUnderlines(context);
  if (context.isReplacingWords) {
    trace('typing', 'our own replacement (auto-correct, pick or Polish): no new request');
    return;
  }
  if (event.inputType.startsWith('delete') && readFieldText(context.field).text.trimEnd() === context.typing.lastSentText.trimEnd()) {
    trace('typing', 'only trailing spaces were removed since the last request: no new request');
    return;
  }
  scheduleRequest(context);
}

export function handleKeyDown(context: AssistantContext, event: KeyboardEvent) {
  handleGhostKey(context, event);
}

export function handleKeyUp(context: AssistantContext, event: KeyboardEvent) {
  if (CARET_KEYS.has(event.key) && !event.shiftKey && !context.spelling.openPopover) {
    openPopover(context);
  }
}

export function handleClick(context: AssistantContext) {
  setTimeout(() => openPopover(context), 0);
}

export function handleSelectionChange(context: AssistantContext) {
  const anchor = document.getSelection()?.anchorNode;
  if (!anchor || !context.field.contains(anchor)) {
    return;
  }
  hideGhostIfCaretMoved(context);
  redrawUnderlines(context);
}

export function handleCompositionStart(context: AssistantContext) {
  context.typing.isComposing = true;
  hideGhost(context);
}

export function handleCompositionEnd(context: AssistantContext) {
  context.typing.isComposing = false;
}

export function stopCheckWhileTyping(context: AssistantContext) {
  clearTimeout(context.typing.requestTimer);
  context.typing.runningRequest?.abort();
  hideGhost(context);
}
