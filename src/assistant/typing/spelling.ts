import { createHighlight, replaceText, restoreSelection, selectedRange } from '../browser';
import { replaceWords } from '../replace-words';
import type { Mistake } from '../llm/check-request';
import { caretOffset, rangeOf, readFieldText, type FieldText } from '../text/field-text';
import { placeMistakes, type PlacedMistake } from '../text/mistake-places';
import { directionOfLastWord, lowercaseWordsIn } from '../text/words';
import type { AssistantContext } from '../types';
import { trace } from '../trace';

const SPELLING_ERROR_HIGHLIGHT = 'bp-spelling-error';
const MAX_SUGGESTIONS = 5;

interface SpellingSettings {
  autoCorrect: boolean;
  customWords: string[];
  onIgnoredWordsChange: (words: string[]) => void;
}

export function createSpelling(context: AssistantContext, settings: SpellingSettings) {
  const { field, log } = context;
  const customWords = new Set(settings.customWords);
  const underline = createHighlight(SPELLING_ERROR_HIGHLIGHT);

  let mistakes: Mistake[] = [];
  const replacementByOriginal = new Map<string, string>();
  let openPopover: { place: PlacedMistake; selectionBefore?: Range } | undefined;
  let lastUnderlinedWords = '';

  const spellcheckAttributeBefore = field.getAttribute('spellcheck');
  field.setAttribute('spellcheck', 'false');

  const isOpenMistake = (place: PlacedMistake) => !customWords.has(place.word);
  const mistakePlaces = (text: string) => placeMistakes(text, mistakes).filter(isOpenMistake);
  const finishedMistakePlaces = (fieldText: FieldText) => {
    const caret = caretOffset(fieldText);
    const isFollowedByBoundary = (place: PlacedMistake) => /^[^\p{L}\p{M}\p{N}]/u.test(fieldText.text.slice(place.end));
    return mistakePlaces(fieldText.text).filter((place) => place.end !== caret && isFollowedByBoundary(place));
  };

  function applyMistakes(newMistakes: Mistake[]) {
    mistakes = newMistakes;
    const fieldText = readFieldText(field);
    const placed = placeMistakes(fieldText.text, mistakes);
    const notFound = mistakes.filter((mistake) => !placed.some((place) => place.mistake === mistake));
    trace('spelling', `model reported ${mistakes.length} mistake(s); ${placed.length} place(s) found in the field`, placed.map((place) => `${place.word} @${place.start} → ${place.mistake.fixes.join(' / ')}${place.mistake.sure ? ' (sure)' : ''}`));
    if (notFound.length) trace('spelling', 'context not found in the field (text changed, or the model did not copy it exactly): ignored', notFound);
    if (!settings.autoCorrect) trace('spelling', 'auto-correct is off: mistakes are only underlined');
    if (settings.autoCorrect) autoCorrectSureMistakes();
    redrawUnderlines();
  }

  function redrawUnderlines() {
    const fieldText = readFieldText(field);
    if (!fieldText.text.trim()) mistakes = [];
    const underlined = mistakePlaces(fieldText.text);
    const underlinedWords = underlined.map((place) => `${place.word}@${place.start}`).join(', ');
    if (underlinedWords !== lastUnderlinedWords) trace('spelling', `underlined: ${underlinedWords || 'nothing'}`);
    lastUnderlinedWords = underlinedWords;
    underline.show(underlined.map((place) => rangeOf(fieldText, place.start, place.end)));
  }

  const wouldUndoAutoCorrection = (place: PlacedMistake) => replacementByOriginal.get(place.mistake.fixes[0]) === place.word;

  function autoCorrectSureMistakes() {
    const candidates = finishedMistakePlaces(readFieldText(field));
    const whySkipped = (place: PlacedMistake) =>
      !place.mistake.sure ? 'model not sure' : wouldUndoAutoCorrection(place) ? 'would undo an earlier auto-correction' : '';
    candidates.filter(whySkipped).forEach((place) => trace('spelling', `not auto-corrected: ${place.word} (${whySkipped(place)})`));
    const placesToFix = candidates.filter((place) => !whySkipped(place));
    if (placesToFix.length) trace('spelling', `auto-correcting ${placesToFix.length} word(s)`, placesToFix.map((place) => `${place.word} → ${place.mistake.fixes[0]}`));
    const replacements = placesToFix.map((place) => ({ place, replacement: place.mistake.fixes[0] }));
    for (const { place, replacement } of replaceWords(field, replacements)) {
      replacementByOriginal.set(place.word, replacement);
      log({ type: 'autocorrect', original: place.word, replacement });
    }
  }

  function noticeUndo() {
    const wordsInField = new Set(lowercaseWordsIn(readFieldText(field).text));
    for (const [original, replacement] of replacementByOriginal) {
      if (!wordsInField.has(original.toLowerCase())) {
        continue;
      }
      trace('spelling', `Ctrl/Cmd+Z brought back "${original}": it is now ignored and never auto-corrected again`);
      replacementByOriginal.delete(original);
      addIgnoredWord(original);
      log({ type: 'revert', original, replacement });
    }
  }

  function openPopoverAtCaret(): boolean {
    if (context.getState().polish.preview) {
      return false;
    }
    const fieldText = readFieldText(field);
    const caret = caretOffset(fieldText);
    if (caret === undefined) {
      return false;
    }
    const place = mistakePlaces(fieldText.text).find((candidate) => candidate.start <= caret && caret <= candidate.end);
    if (!place) {
      return false;
    }

    trace('spelling', `popover opened for "${place.word}"`, place.mistake.fixes);
    openPopover = { place, selectionBefore: selectedRange() };
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

  function closePopover(returnCaret = false) {
    const closing = openPopover;
    if (!closing) {
      return;
    }
    openPopover = undefined;
    context.setState({ popover: undefined });
    if (returnCaret && closing.selectionBefore) restoreSelection(field, closing.selectionBefore);
  }

  function pickSuggestion(suggestion: string) {
    const place = openPopover?.place;
    closePopover(true);
    const fieldText = readFieldText(field);
    if (!place || fieldText.text.slice(place.start, place.end) !== place.word) {
      trace('spelling', 'pick ignored: the word changed while the popover was open');
      return;
    }
    trace('spelling', `picked "${suggestion}" for "${place.word}"`);
    replaceText(field, rangeOf(fieldText, place.start, place.end), suggestion);
    log({ type: 'pick', original: place.word, replacement: suggestion });
    redrawUnderlines();
  }

  function addIgnoredWord(word: string) {
    context.ignoredWords = [...new Set([...context.ignoredWords, word])];
    settings.onIgnoredWordsChange(context.ignoredWords);
  }

  function addToDictionary(word: string) {
    customWords.add(word);
    trace('spelling', `"${word}" added to the custom dictionary`);
    closePopover(true);
    redrawUnderlines();
  }

  function ignoreWord() {
    const place = openPopover?.place;
    closePopover(true);
    if (!place) {
      return;
    }
    addIgnoredWord(place.word);
    trace('spelling', `"${place.word}" added to the ignored words: never auto-corrected`);
    log({ type: 'ignore', word: place.word });
  }

  function release() {
    closePopover();
    underline.remove();
    if (spellcheckAttributeBefore === null) field.removeAttribute('spellcheck');
    else field.setAttribute('spellcheck', spellcheckAttributeBefore);
  }

  return {
    applyMistakes,
    redrawUnderlines,
    noticeUndo,
    openPopoverAtCaret,
    closePopover,
    pickSuggestion,
    ignoreWord,
    addToDictionary,
    isPopoverOpen: () => !!openPopover,
    release,
  };
}
