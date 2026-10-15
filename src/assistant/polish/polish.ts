import { requestCheck } from '../openai/check-request';
import { replaceWords, type WordReplacement } from '../replace-words';
import { readFieldText } from '../text/field-text';
import { placeMistakes } from '../text/mistake-places';
import { countWords, directionOfText } from '../text/words';
import type { AssistantContext, AssistantOptions, PolishState } from '../types';
import { wordDiff } from './word-diff';
import { trace } from '../trace';

const MIN_WORDS = 3;
const DRAFT_CHANGED_MESSAGE = 'The draft changed after you pressed Polish. Polish again to get fresh suggestions.';

interface PolishSettings extends Pick<AssistantOptions, 'apiKey' | 'customWords' | 'canned' | 'kb' | 'conversation'> {
  beforeRequest(): void;
}

function applyToText(text: string, replacements: WordReplacement[]): string {
  return [...replacements]
    .sort((first, second) => second.place.start - first.place.start)
    .reduce((result, { place, replacement }) => result.slice(0, place.start) + replacement + result.slice(place.end), text);
}

export function createPolish(context: AssistantContext, settings: PolishSettings) {
  const { field, log } = context;
  const customWords = new Set(settings.customWords);
  let runningRequest: AbortController | undefined;
  let openPreview: { sentDraft: string; replacements: WordReplacement[] } | undefined;
  let isReleased = false;

  const updateState = (patch: Partial<PolishState>) => context.setState({ polish: { ...context.getState().polish, ...patch } });
  const showMessage = (message: string) => updateState({ preview: { dir: directionOfText(readFieldText(field).text), segments: [], message } });

  function handleFieldChanged() {
    updateState({ canPolish: countWords(readFieldText(field).text) >= MIN_WORDS });
  }

  async function polishNow() {
    if (isReleased || runningRequest || context.getState().popover) return;
    const draft = readFieldText(field).text;
    if (countWords(draft) < MIN_WORDS) return;

    trace('polish', 'Polish pressed: asking for every mistake, sure or not');
    settings.beforeRequest();
    openPreview = undefined;
    const request = new AbortController();
    runningRequest = request;
    updateState({ busy: true, preview: undefined });
    log({ type: 'polish-request', text: draft });
    const answer = await requestCheck(
      settings.apiKey,
      {
        draft,
        textBeforeCaret: null,
        conversation: settings.conversation(),
        cannedResponses: settings.canned,
        articles: settings.kb,
        customWords: settings.customWords,
      },
      request.signal,
    );
    log({ type: 'polish-reply', reply: answer });
    runningRequest = undefined;
    if (isReleased || request.signal.aborted) return;
    updateState({ busy: false });

    if (!answer) {
      showMessage('Polishing is unavailable right now.');
      return;
    }
    const replacements = placeMistakes(draft, answer.mistakes)
      .filter((place) => !customWords.has(place.word))
      .map((place) => ({ place, replacement: place.mistake.fixes[0] }));
    if (!replacements.length) {
      showMessage('No changes suggested.');
      return;
    }
    trace('polish', `preview: ${replacements.length} fix(es)`, replacements.map(({ place, replacement }) => `${place.word} @${place.start} → ${replacement}`));
    openPreview = { sentDraft: draft, replacements };
    updateState({ preview: { dir: directionOfText(draft), segments: wordDiff(draft, applyToText(draft, replacements)) } });
  }

  function accept() {
    if (!openPreview) return;
    const { sentDraft, replacements } = openPreview;
    openPreview = undefined;
    if (readFieldText(field).text !== sentDraft) {
      trace('polish', 'Accept refused: the draft changed after Polish was pressed');
      showMessage(DRAFT_CHANGED_MESSAGE);
      return;
    }
    trace('polish', 'Accept: applying the fixes like auto-correct');
    updateState({ preview: undefined });
    for (const { place, replacement } of replaceWords(field, replacements)) {
      log({ type: 'polish', original: place.word, replacement });
    }
  }

  function dismiss() {
    openPreview = undefined;
    updateState({ preview: undefined });
  }

  handleFieldChanged();

  return {
    polishNow,
    accept,
    dismiss,
    handleFieldChanged,
    release() {
      isReleased = true;
      runningRequest?.abort();
    },
  };
}
