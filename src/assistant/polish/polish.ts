import { requestCheck } from '../llm/check-request';
import { replaceText } from '../browser';
import type { WordReplacement } from '../replace-words';
import { rangeOf, readFieldText } from '../text/field-text';
import { placeMistakes } from '../text/mistake-places';
import { directionOfText } from '../text/words';
import type { AssistantContext, PolishState } from '../types';
import { closePanels } from '../typing/check-while-typing';
import { wordDiff } from './word-diff';
import { trace } from '../trace';

function applyToText(text: string, replacements: WordReplacement[]): string {
  return [...replacements]
    .sort((first, second) => second.place.start - first.place.start)
    .reduce((result, { place, replacement }) => result.slice(0, place.start) + replacement + result.slice(place.end), text);
}

const updateState = (context: AssistantContext, patch: Partial<PolishState>) => context.setState({ polish: { ...context.getState().polish, ...patch } });
const showMessage = (context: AssistantContext, message: string) =>
  updateState(context, { preview: { dir: directionOfText(readFieldText(context.field).text), segments: [], message } });

export async function polishNow(context: AssistantContext) {
  const { polish, options } = context;
  if (context.isReleased || polish.runningRequest || context.getState().popover) {
    return;
  }
  const draft = readFieldText(context.field).text;

  trace('polish', 'Polish pressed: asking for every mistake, sure or not');
  closePanels(context);
  polish.openPreview = undefined;
  const request = new AbortController();
  polish.runningRequest = request;
  updateState(context, { busy: true, preview: undefined });
  context.log({ type: 'polish-request', text: draft });
  const answer = await requestCheck(
    options.apiKey,
    {
      draft,
      textBeforeCaret: null,
      conversation: options.conversation,
      cannedResponses: options.canned,
      articles: options.kb,
      customWords: [...context.customWords],
      ignoredWords: context.ignoredWords,
    },
    request.signal,
  );
  context.log({ type: 'polish-reply', reply: answer });
  polish.runningRequest = undefined;
  if (context.isReleased || request.signal.aborted) {
    return;
  }
  updateState(context, { busy: false });

  if (!answer) {
    showMessage(context, 'Polishing is unavailable right now.');
    return;
  }
  const replacements = placeMistakes(draft, answer.mistakes)
    .filter((place) => !context.customWords.has(place.word))
    .map((place) => ({ place, replacement: place.mistake.fixes[0] }));
  if (!replacements.length) {
    showMessage(context, 'No changes suggested.');
    return;
  }
  trace('polish', `preview: ${replacements.length} fix(es)`, replacements.map(({ place, replacement }) => `${place.word} @${place.start} → ${replacement}`));
  const polishedText = applyToText(draft, replacements);
  polish.openPreview = { sentDraft: draft, polishedText };
  updateState(context, { preview: { dir: directionOfText(draft), segments: wordDiff(draft, polishedText) } });
}

export function acceptPolish(context: AssistantContext) {
  const { openPreview } = context.polish;
  if (!openPreview) {
    return;
  }
  dismissPolish(context);
  const fieldText = readFieldText(context.field);
  if (fieldText.text !== openPreview.sentDraft) {
    trace('polish', 'Accept skipped: the draft changed after Polish was pressed');
    return;
  }
  trace('polish', 'Accept: the whole text is replaced (one undo step)');
  context.isReplacingWords = true;
  replaceText(context.field, rangeOf(fieldText, 0, fieldText.text.length), openPreview.polishedText);
  context.isReplacingWords = false;
  context.log({ type: 'polish', text: openPreview.polishedText });
}

export function dismissPolish(context: AssistantContext) {
  context.polish.openPreview = undefined;
  updateState(context, { preview: undefined });
}

export function stopPolish(context: AssistantContext) {
  context.polish.runningRequest?.abort();
}
