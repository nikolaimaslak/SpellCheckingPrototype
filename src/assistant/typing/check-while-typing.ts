import { spellCheckWithLLM, autoCompleteWithLLM, type Mistake } from '../llm';
import { caretOffset, readFieldText } from '../text/field-text';
import type { AssistantContext, AssistantState } from '../types';
import { ghostFollowsTyping, handleGhostKey, hideGhost, hideGhostIfCaretMoved, showGhost } from './ghost-text';
import { displayAndAutocorrectMistakes, noticeRedo, noticeUndo, openPopoverAtCaret, redrawUnderlines } from './spell-check';
import { trace } from '../trace';

const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

function updateLoader(context: AssistantContext) {
  const loader: AssistantState['loader'] = context.typing.runningRequest
    ? { kind: 'request' }
    : context.typing.requestTimer
      ? {
          kind: 'debounce',
          startedAt: context.typing.debounceStartedAt,
          durationMs: context.options.debounceMs,
        }
      : undefined;
  if (JSON.stringify(context.getState().loader) === JSON.stringify(loader)) {
    return;
  }
  trace('typing', `loader ${loader?.kind ?? 'off'}`);
  context.setState({ loader });
}

function abortRunningRequest(context: AssistantContext, why: string) {
  if (context.typing.runningRequest) {
    trace('typing', `${why}: the running request is aborted`);
    context.typing.runningRequest.abort();
    context.typing.runningRequest = undefined;
  }
}

export function cancelPendingRequest(context: AssistantContext) {
  if (context.typing.requestTimer) {
    trace('typing', 'Escape: the debounce timer is cleared');
    clearTimeout(context.typing.requestTimer);
    context.typing.requestTimer = undefined;
  }
  abortRunningRequest(context, 'Escape');
  updateLoader(context);
}

function scheduleLLMRequest(context: AssistantContext) {
  abortRunningRequest(context, 'text changed');
  if (context.options.spellCheckMode === 'off' && !context.options.withAutoCompletion) {
    trace('typing', 'spell check and auto-completion are off: no request');
    return;
  }
  if (!readFieldText(context.field).text.trim()) {
    trace('typing', 'the field is empty: no request');
    clearTimeout(context.typing.requestTimer);
    context.typing.requestTimer = undefined;
    context.typing.lastSentText = '';
    updateLoader(context);
    return;
  }
  trace('typing', context.typing.requestTimer ? `typing continues: debounce timer restarted (${context.options.debounceMs} ms)` : `debounce timer started: request in ${context.options.debounceMs} ms unless typing continues`);
  clearTimeout(context.typing.requestTimer);
  context.typing.requestTimer = setTimeout(() => void sendLLMRequest(context), context.options.debounceMs);
  context.typing.debounceStartedAt = Date.now();
  updateLoader(context);
}

async function sendLLMRequest(context: AssistantContext) {

  clearTimeout(context.typing.requestTimer);
  context.typing.requestTimer = undefined;

  const sentText = readFieldText(context.field);
  const caret = caretOffset(sentText);
  context.typing.lastSentText = sentText.text;

  if (!sentText.text.trim()) {
    trace('typing', 'debounce over, but the field is empty: nothing to send');
    updateLoader(context);
    return;
  }

  const shouldSpellCheck = context.options.spellCheckMode !== 'off';
  const shouldAskAutoCompletion = canAskAutoCompletion(context, sentText.text, caret);
  if (!shouldSpellCheck && !shouldAskAutoCompletion) {
    trace('typing', 'debounce over, but spell check is off and no auto-completion can be asked for here: nothing to send');
    updateLoader(context);
    return;
  }
  trace('typing', `debounce over: sending the draft (${[shouldSpellCheck && 'spell check', shouldAskAutoCompletion && 'auto-completion'].filter(Boolean).join(' + ')})`, {
    draft: sentText.text,
    caret,
  });

  const request = new AbortController();
  context.typing.runningRequest = request;
  updateLoader(context);
  const [mistakes, autoCompletion] = await Promise.all([
    shouldSpellCheck ? askSpellCheck(context, sentText.text, caret, request.signal) : [],
    shouldAskAutoCompletion ? askAutoCompletion(context, sentText.text, caret!, request.signal) : '',
  ]);
  if (request.signal.aborted) {
    trace('typing', 'answers dropped: the request was aborted');
    return;
  }
  context.typing.runningRequest = undefined;

  const currentText = readFieldText(context.field);
  const hasNothingMoved = currentText.text === sentText.text && caretOffset(currentText) === caret;
  if (shouldSpellCheck && mistakes) {
    displayAndAutocorrectMistakes(context, mistakes);
  }
  if (!shouldAskAutoCompletion || autoCompletion === null) {
    trace('typing', 'no auto-completion to show');
  } else if (!hasNothingMoved) {
    trace('typing', 'auto-completion dropped: the text or the caret moved while waiting');
  } else {
    showGhost(context, autoCompletion, caret!);
  }
  if (mistakes === null || autoCompletion === null) {
    trace('typing', 'a request got no answer (no key, network error, timeout or unreadable JSON): red cross for 2 s');
    context.setState({ loader: { kind: 'failed' } });
    setTimeout(() => updateLoader(context), 2000);
    return;
  }
  updateLoader(context);
}

async function askSpellCheck(context: AssistantContext, draft: string, caret: number | undefined, signal: AbortSignal): Promise<Mistake[] | null> {
  context.log({ type: 'spell-check-request', text: draft });
  const result = await spellCheckWithLLM(
    context.options.apiKey,
    {
      draft,
      caretOffset: caret,
      llmContext: context.options.llmContext,
      customWords: [...context.customWords],
      ignoredWords: context.ignoredWords,
    },
    signal,
  );
  if (signal.aborted) {
    return null;
  }
  if ('error' in result) {
    context.log({ type: 'spell-check-error', error: result.error });
    return null;
  }
  context.log({ type: 'spell-check-answer', reply: result.answer });
  return result.answer;
}

async function askAutoCompletion(context: AssistantContext, draft: string, caret: number, signal: AbortSignal): Promise<string | null> {
  context.log({ type: 'auto-completion-request', text: draft });
  const result = await autoCompleteWithLLM(
    context.options.apiKey,
    {
      draft,
      caretOffset: caret,
      isCaretOnNewLine: draft.slice(0, caret).endsWith('\n'),
      llmContext: context.options.llmContext,
    },
    signal,
  );
  if (signal.aborted) {
    return null;
  }
  if ('error' in result) {
    context.log({ type: 'auto-completion-error', error: result.error });
    return null;
  }
  context.log({ type: 'auto-completion-answer', reply: result.answer });
  return result.answer;
}

function canAskAutoCompletion(context: AssistantContext, text: string, caret: number | undefined): boolean {
  // isComposing: an input method (Japanese, Chinese, accent keys) is still building the last word.
  if (!context.options.withAutoCompletion || caret === undefined || context.typing.isComposing) {
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

export function handleInput(context: AssistantContext, event: InputEvent) {
  trace('typing', `input: ${event.inputType}${event.data ? ` ${JSON.stringify(event.data)}` : ''}`);
  if (event.inputType === 'historyUndo') {
    noticeUndo(context);
  } else if (event.inputType === 'historyRedo') {
    noticeRedo(context);
  } else {
    context.spellCheck.undoneAutoCorrections = [];
  }
  const isFollowingGhost = ghostFollowsTyping(context, event);
  if (!isFollowingGhost) {
    hideGhost(context);
  }
  redrawUnderlines(context);
  if (context.isReplacingWords) {
    trace('typing', 'auto-correct changed the text, not the user: no new request');
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
  if (CARET_KEYS.has(event.key) && !event.shiftKey && !context.spellCheck.openPopover) {
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
