import { removeHighlight, replaceText, restoreSelection, selectedRange, showHighlight } from '../browser';
import { replaceWords } from '../replace-words';
import type { Mistake } from '../llm/check-request';
import { caretOffset, rangeOf, readFieldText, type FieldText } from '../text/field-text';
import { placeMistakes, type PlacedMistake } from '../text/mistake-places';
import { directionOfLastWord, findWordPlaces } from '../text/words';
import type { AssistantContext } from '../types';
import { trace } from '../trace';

const SPELLING_ERROR_HIGHLIGHT = 'bp-spelling-error';
const MAX_SUGGESTIONS = 5;

export function stopSpelling(context: AssistantContext) {
  closePopover(context);
  removeHighlight(SPELLING_ERROR_HIGHLIGHT);
}

function mistakePlaces(context: AssistantContext, text: string): PlacedMistake[] {
  return placeMistakes(text, context.spelling.mistakes).filter((place) => !context.customWords.has(place.word));
}

function finishedMistakePlaces(context: AssistantContext, fieldText: FieldText): PlacedMistake[] {
  const caret = caretOffset(fieldText);
  const isFollowedByBoundary = (place: PlacedMistake) => /^[^\p{L}\p{M}\p{N}]/u.test(fieldText.text.slice(place.end));
  return mistakePlaces(context, fieldText.text).filter((place) => place.end !== caret && isFollowedByBoundary(place));
}

export function applyMistakes(context: AssistantContext, newMistakes: Mistake[]) {
  context.spelling.mistakes = newMistakes;
  const fieldText = readFieldText(context.field);
  const placed = placeMistakes(fieldText.text, newMistakes);
  const notFound = newMistakes.filter((mistake) => !placed.some((place) => place.mistake === mistake));
  trace('spelling', `model reported ${newMistakes.length} mistake(s); ${placed.length} place(s) found in the field`, placed.map((place) => `${place.word} @${place.start} → ${place.mistake.fixes.join(' / ')}${place.mistake.sure ? ' (sure)' : ''}`));
  if (notFound.length) trace('spelling', 'context not found in the field (text changed, or the model did not copy it exactly): ignored', notFound);
  if (context.options.spelling === 'auto') autoCorrectSureMistakes(context);
  else trace('spelling', 'auto-correct is off: mistakes are only underlined');
  redrawUnderlines(context);
}

export function redrawUnderlines(context: AssistantContext) {
  const fieldText = readFieldText(context.field);
  if (!fieldText.text.trim()) context.spelling.mistakes = [];
  const underlined = mistakePlaces(context, fieldText.text);
  const underlinedWords = underlined.map((place) => `${place.word}@${place.start}`).join(', ');
  if (underlinedWords !== context.spelling.lastUnderlinedWords) trace('spelling', `underlined: ${underlinedWords || 'nothing'}`);
  context.spelling.lastUnderlinedWords = underlinedWords;
  showHighlight(SPELLING_ERROR_HIGHLIGHT, underlined.map((place) => rangeOf(fieldText, place.start, place.end)));
}

function autoCorrectSureMistakes(context: AssistantContext) {
  const { replacementByOriginal } = context.spelling;
  const wouldUndoAutoCorrection = (place: PlacedMistake) => replacementByOriginal.get(place.mistake.fixes[0]) === place.word;
  const candidates = finishedMistakePlaces(context, readFieldText(context.field));
  const whySkipped = (place: PlacedMistake) =>
    !place.mistake.sure ? 'model not sure' : wouldUndoAutoCorrection(place) ? 'would undo an earlier auto-correction' : '';
  candidates.filter(whySkipped).forEach((place) => trace('spelling', `not auto-corrected: ${place.word} (${whySkipped(place)})`));
  const placesToFix = candidates.filter((place) => !whySkipped(place));
  if (placesToFix.length) trace('spelling', `auto-correcting ${placesToFix.length} word(s)`, placesToFix.map((place) => `${place.word} → ${place.mistake.fixes[0]}`));
  const replacements = placesToFix.map((place) => ({ place, replacement: place.mistake.fixes[0] }));
  for (const { place, replacement } of replaceWords(context, replacements)) {
    replacementByOriginal.set(place.word, replacement);
    context.log({ type: 'autocorrect', original: place.word, replacement });
  }
}

export function noticeUndo(context: AssistantContext) {
  const fieldText = readFieldText(context.field).text;
  for (const [original, replacement] of context.spelling.replacementByOriginal) {
    if (!findWordPlaces(fieldText, [original]).length) {
      continue;
    }
    trace('spelling', `Ctrl/Cmd+Z brought back "${original}": it is now ignored and never auto-corrected again`);
    context.spelling.replacementByOriginal.delete(original);
    addIgnoredWord(context, original);
    context.log({ type: 'revert', original, replacement });
  }
}

export function openPopoverAtCaret(context: AssistantContext): boolean {
  if (context.getState().polish.preview) {
    return false;
  }
  const fieldText = readFieldText(context.field);
  const caret = caretOffset(fieldText);
  if (caret === undefined) {
    return false;
  }
  const place = mistakePlaces(context, fieldText.text).find((candidate) => candidate.start <= caret && caret <= candidate.end);
  if (!place) {
    return false;
  }

  trace('spelling', `popover opened for "${place.word}"`, place.mistake.fixes);
  context.spelling.openPopover = { place, selectionBefore: selectedRange() };
  context.setState({
    popover: {
      word: place.word,
      wordStartOffset: place.start,
      wordEndOffset: place.end,
      dir: directionOfLastWord(place.word),
      suggestions: place.mistake.fixes.slice(0, MAX_SUGGESTIONS),
    },
  });
  return true;
}

export function closePopover(context: AssistantContext, returnCaret = false) {
  const closing = context.spelling.openPopover;
  if (!closing) {
    return;
  }
  context.spelling.openPopover = undefined;
  context.setState({ popover: undefined });
  if (returnCaret && closing.selectionBefore) restoreSelection(context.field, closing.selectionBefore);
}

export function pickSuggestion(context: AssistantContext, suggestion: string) {
  const place = context.spelling.openPopover?.place;
  closePopover(context, true);
  const fieldText = readFieldText(context.field);
  if (!place || fieldText.text.slice(place.start, place.end) !== place.word) {
    trace('spelling', 'pick ignored: the word changed while the popover was open');
    return;
  }
  trace('spelling', `picked "${suggestion}" for "${place.word}"`);
  replaceText(context.field, rangeOf(fieldText, place.start, place.end), suggestion);
  context.log({ type: 'pick', original: place.word, replacement: suggestion });
  redrawUnderlines(context);
}

function addIgnoredWord(context: AssistantContext, word: string) {
  context.ignoredWords = [...new Set([...context.ignoredWords, word])];
  context.options.onIgnoredWordsChange(context.ignoredWords);
}

export function addToDictionary(context: AssistantContext, word: string) {
  context.customWords.add(word);
  trace('spelling', `"${word}" added to the custom dictionary`);
  closePopover(context, true);
  redrawUnderlines(context);
}

export function ignoreWord(context: AssistantContext) {
  const place = context.spelling.openPopover?.place;
  closePopover(context, true);
  if (!place) {
    return;
  }
  addIgnoredWord(context, place.word);
  trace('spelling', `"${place.word}" added to the ignored words: never auto-corrected`);
  context.log({ type: 'ignore', word: place.word });
}
