import { checkDraftWithLLM } from '../llm';
import { replaceText } from '../browser';
import type { WordReplacement } from '../replace-words';
import { rangeOf, readFieldText } from '../text/field-text';
import { findMistakesInText } from '../text/mistake-places';
import { directionOfText } from '../text/words';
import type { AssistantContext, FixSpellingState } from '../types';
import { closePanels } from '../typing/check-while-typing';
import { wordDiff } from './word-diff';
import { trace } from '../trace';

function applyToText(text: string, replacements: WordReplacement[]): string {
  return [...replacements]
    .sort((first, second) => second.place.start - first.place.start)
    .reduce((result, { place, replacement }) => result.slice(0, place.start) + replacement + result.slice(place.end), text);
}

const updateState = (context: AssistantContext, patch: Partial<FixSpellingState>) => context.setState({ fixSpelling: { ...context.getState().fixSpelling, ...patch } });
const showMessage = (context: AssistantContext, message: string) =>
  updateState(context, {
    preview: {
      dir: directionOfText(readFieldText(context.field).text),
      segments: [],
      message,
    },
  });

export async function fixSpellingNow(context: AssistantContext) {
  const { fixSpelling, options } = context;
  if (fixSpelling.runningRequest) {
    return;
  }
  const draft = readFieldText(context.field).text;

  trace('fix-spelling', 'Fix spelling pressed: asking for every mistake, sure or not');
  closePanels(context);
  fixSpelling.openPreview = undefined;
  const request = new AbortController();
  fixSpelling.runningRequest = request;
  updateState(context, { busy: true, preview: undefined });
  context.log({ type: 'fix-spelling-request', text: draft });
  const answer = await checkDraftWithLLM(
    options.apiKey,
    {
      draft,
      shouldAskCompletion: false,
      llmContext: options.llmContext,
      customWords: [...context.customWords],
      ignoredWords: context.ignoredWords,
    },
    request.signal,
  );
  context.log({ type: 'fix-spelling-reply', reply: answer });
  fixSpelling.runningRequest = undefined;
  if (request.signal.aborted) {
    return;
  }
  updateState(context, { busy: false });

  if (!answer) {
    showMessage(context, 'Fixing spelling is unavailable right now.');
    return;
  }
  const replacements = findMistakesInText(draft, answer.mistakes).map((place) => ({ place, replacement: place.mistake.fixes[0] }));
  if (!replacements.length) {
    showMessage(context, 'No changes suggested.');
    return;
  }
  trace('fix-spelling', `preview: ${replacements.length} fix(es)`, replacements.map(({ place, replacement }) => `${place.word} @${place.start} → ${replacement}`));
  const fixedText = applyToText(draft, replacements);
  fixSpelling.openPreview = { sentDraft: draft, fixedText };
  updateState(context, { preview: { dir: directionOfText(draft), segments: wordDiff(draft, fixedText) } });
}

export function acceptSpellingFixes(context: AssistantContext) {
  const { openPreview } = context.fixSpelling;
  if (!openPreview) {
    return;
  }
  dismissSpellingFixes(context);
  const fieldText = readFieldText(context.field);
  if (fieldText.text !== openPreview.sentDraft) {
    trace('fix-spelling', 'Accept skipped: the draft changed after Fix spelling was pressed');
    return;
  }
  trace('fix-spelling', 'Accept: the whole text is replaced (one undo step)');
  context.isReplacingWords = true;
  replaceText(context.field, rangeOf(fieldText, 0, fieldText.text.length), openPreview.fixedText);
  context.isReplacingWords = false;
  context.log({ type: 'fix-spelling', text: openPreview.fixedText });
}

export function dismissSpellingFixes(context: AssistantContext) {
  context.fixSpelling.openPreview = undefined;
  updateState(context, { preview: undefined });
}

export function stopFixSpelling(context: AssistantContext) {
  context.fixSpelling.runningRequest?.abort();
}
