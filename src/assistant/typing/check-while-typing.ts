import { checkDraftWithLLM } from '../llm';
import { caretOffset, readFieldText } from '../text/field-text';
import type { AssistantContext, AssistantState } from '../types';
import { ghostFollowsTyping, handleGhostKey, hideGhost, hideGhostIfCaretMoved, showGhost } from './ghost-text';
import { displayAndAutocorrectMistakes, closePopover, noticeUndo, openPopoverAtCaret, redrawUnderlines } from './spelling';
import { trace } from '../trace';

const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

function updateLoader(context: AssistantContext) {
  const { typing } = context;
  const loader: AssistantState['loader'] = typing.runningRequest
    ? { kind: 'request' }
    : typing.requestTimer
      ? { kind: 'debounce', startedAt: typing.debounceStartedAt, durationMs: context.options.debounceMs }
      : undefined;
  if (JSON.stringify(context.getState().loader) === JSON.stringify(loader)) {
    return;
  }
  trace('typing', `loader ${loader?.kind ?? 'off'}`);
  context.setState({ loader });
}

function abortRunningRequest(context: AssistantContext, why: string) {
  const { typing } = context;
  if (typing.runningRequest) {
    trace('typing', `${why}: the running request is aborted`);
    typing.runningRequest.abort();
    typing.runningRequest = undefined;
  }
}

export function cancelPendingRequest(context: AssistantContext) {
  const { typing } = context;
  if (typing.requestTimer) {
    trace('typing', 'Escape: the debounce timer is cleared');
    clearTimeout(typing.requestTimer);
    typing.requestTimer = undefined;
  }
  abortRunningRequest(context, 'Escape');
  updateLoader(context);
}

function scheduleLLMRequest(context: AssistantContext) {
  const { typing, options } = context;
  abortRunningRequest(context, 'text changed');
  if (options.spellCheckMode === 'off' && !options.withCompletion) {
    trace('typing', 'spelling and completion are off: no request');
    return;
  }
  trace('typing', typing.requestTimer ? `typing continues: debounce timer restarted (${options.debounceMs} ms)` : `debounce timer started: request in ${options.debounceMs} ms unless typing continues`);
  clearTimeout(typing.requestTimer);
  typing.requestTimer = setTimeout(() => void sendLLMRequest(context), options.debounceMs);
  typing.debounceStartedAt = Date.now();
  updateLoader(context);
}

async function sendLLMRequest(context: AssistantContext) {
  const { typing, options, field } = context;
  clearTimeout(typing.requestTimer);
  typing.requestTimer = undefined;
  const sentText = readFieldText(field);
  const caret = caretOffset(sentText);
  typing.lastSentText = sentText.text;
  if (!sentText.text.trim()) {
    trace('typing', 'debounce over, but the field is empty: nothing to send');
    updateLoader(context);
    return;
  }
  const shouldAskCompletion = canAskCompletion(context, sentText.text, caret);
  trace('typing', `debounce over: sending the draft${shouldAskCompletion ? ' (spelling + completion after the caret)' : ' (spelling only)'}`, {
    draft: sentText.text,
    caret,
  });

  const request = new AbortController();
  typing.runningRequest = request;
  updateLoader(context);
  context.log({ type: 'send-to-llm', text: sentText.text, withCompletion: shouldAskCompletion });
  const answer = await checkDraftWithLLM(
    options.apiKey,
    {
      draft: sentText.text,
      shouldAskCompletion,
      caretOffset: caret,
      isCaretOnNewLine: sentText.text.slice(0, caret).endsWith('\n'),
      llmContext: options.llmContext,
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
    if (options.spellCheckMode !== 'off') {
      displayAndAutocorrectMistakes(context, answer.mistakes);
    }
    if (!shouldAskCompletion) {
      trace('typing', 'no completion was asked for');
    } else if (!nothingMoved) {
      trace('typing', 'completion dropped: the text or the caret moved while waiting');
    } else {
      showGhost(context, answer.completion, caret!);
    }
  } else {
    trace('typing', 'no answer (no key, network error, timeout or unreadable JSON): red cross for 2 s');
    context.setState({ loader: { kind: 'failed' } });
    setTimeout(() => updateLoader(context), 2000);
    return;
  }
  updateLoader(context);
}

function canAskCompletion(context: AssistantContext, text: string, caret: number | undefined): boolean {
  // isComposing: an input method (Japanese, Chinese, accent keys) is still building the last word.
  if (!context.options.withCompletion || caret === undefined || context.typing.isComposing) {
    return false;
  }
  const restOfCaretLine = text.slice(caret).split('\n')[0];
  return restOfCaretLine.trim() === '';
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
  const isFollowingGhost = ghostFollowsTyping(context, event);
  if (!isFollowingGhost) {
    hideGhost(context);
  }
  redrawUnderlines(context);
  if (context.isReplacingWords) {
    trace('typing', 'our own replacement (auto-correct, pick or Fix spelling): no new request');
    return;
  }
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    trace('typing', 'undo or redo: no new request');
    return;
  }
  if (isFollowingGhost && context.getState().ghost) {
    trace('typing', 'the input followed the ghost text and some of it is left: no new request');
    return;
  }
  if (
    event.inputType.startsWith('delete') &&
    readFieldText(context.field).text.trimEnd() === context.typing.lastSentText.trimEnd()
  ) {
    trace('typing', 'only trailing spaces were removed since the last request: no new request');
    return;
  }
  scheduleLLMRequest(context);
}

export function handleKeyDown(context: AssistantContext, event: KeyboardEvent) {
  if (event.key === 'Escape') {
    cancelPendingRequest(context);
  }
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
