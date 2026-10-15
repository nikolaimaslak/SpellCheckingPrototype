import { createHighlight, rectOfRange, replaceText, restoreSelection, selectedRange } from '../browser';
import { replaceWords } from '../replace-words';
import type { Mistake } from '../openai/check-request';
import { caretOffset, rangeOf, readFieldText, type FieldText } from '../text/field-text';
import { directionOfLastWord, findWordPlaces, lowercaseWordsIn, type WordPlace } from '../text/words';
import type { AssistantContext, Turn } from '../types';

const SPELLING_ERROR_HIGHLIGHT = 'bp-spelling-error';
const MAX_SUGGESTIONS = 5;

interface SpellingSettings {
  autoCorrect: boolean;
  customWords: string[];
  conversation: () => Turn[];
}

export function createSpelling(context: AssistantContext, settings: SpellingSettings) {
  const { field, log } = context;
  const customWords = new Set(settings.customWords);
  const underline = createHighlight(SPELLING_ERROR_HIGHLIGHT);

  let mistakesByWord = new Map<string, Mistake>();
  const ignoredWords = new Set<string>();
  const replacementByOriginal = new Map<string, string>();
  let openPopover: { place: WordPlace; selectionBefore?: Range } | undefined;

  const spellcheckAttributeBefore = field.getAttribute('spellcheck');
  field.setAttribute('spellcheck', 'false');

  const isOpenMistake = (word: string) => mistakesByWord.has(word) && !ignoredWords.has(word) && !customWords.has(word);
  const mistakePlaces = (text: string) => findWordPlaces(text, [...mistakesByWord.keys()].filter(isOpenMistake));
  const finishedMistakePlaces = (fieldText: FieldText) => {
    const caret = caretOffset(fieldText);
    return mistakePlaces(fieldText.text).filter((place) => place.end !== caret);
  };

  function applyMistakes(mistakes: Mistake[]) {
    mistakesByWord = new Map(mistakes.map((mistake) => [mistake.word, mistake]));
    if (settings.autoCorrect) autoCorrectSureMistakes();
    redrawUnderlines();
  }

  function redrawUnderlines() {
    const fieldText = readFieldText(field);
    if (!fieldText.text.trim()) mistakesByWord = new Map();
    underline.show(finishedMistakePlaces(fieldText).map((place) => rangeOf(fieldText, place.start, place.end)));
  }

  function autoCorrectSureMistakes() {
    const customerWords = new Set(
      settings
        .conversation()
        .filter((turn) => turn.role === 'customer')
        .flatMap((turn) => lowercaseWordsIn(turn.text)),
    );
    const placesToFix = finishedMistakePlaces(readFieldText(field)).filter(
      (place) => mistakesByWord.get(place.word)!.sure && !customerWords.has(place.word.toLowerCase()),
    );
    const replacements = placesToFix.map((place) => ({ place, replacement: mistakesByWord.get(place.word)!.fixes[0] }));
    for (const { place, replacement } of replaceWords(field, replacements)) {
      replacementByOriginal.set(place.word, replacement);
      log({ type: 'autocorrect', original: place.word, replacement });
    }
  }

  function noticeUndo() {
    const wordsInField = new Set(lowercaseWordsIn(readFieldText(field).text));
    for (const [original, replacement] of replacementByOriginal) {
      if (!wordsInField.has(original.toLowerCase())) continue;
      replacementByOriginal.delete(original);
      ignoredWords.add(original);
      log({ type: 'revert', original, replacement });
    }
  }

  function openPopoverAtCaret(): boolean {
    if (context.getState().polish.preview) return false;
    const fieldText = readFieldText(field);
    const caret = caretOffset(fieldText);
    if (caret === undefined) return false;
    const place = mistakePlaces(fieldText.text).find((candidate) => candidate.start <= caret && caret <= candidate.end);
    if (!place) return false;

    openPopover = { place, selectionBefore: selectedRange() };
    context.setState({
      popover: {
        wordRect: rectOfRange(rangeOf(fieldText, place.start, place.end)),
        dir: directionOfLastWord(place.word),
        font: getComputedStyle(field).font,
        suggestions: mistakesByWord.get(place.word)!.fixes.slice(0, MAX_SUGGESTIONS),
      },
    });
    return true;
  }

  function closePopover(returnCaret = false) {
    const closing = openPopover;
    if (!closing) return;
    openPopover = undefined;
    context.setState({ popover: undefined });
    if (returnCaret && closing.selectionBefore) restoreSelection(field, closing.selectionBefore);
  }

  function pickSuggestion(suggestion: string) {
    const place = openPopover?.place;
    closePopover(true);
    const fieldText = readFieldText(field);
    if (!place || fieldText.text.slice(place.start, place.end) !== place.word) return;
    replaceText(field, rangeOf(fieldText, place.start, place.end), suggestion);
    log({ type: 'pick', original: place.word, replacement: suggestion });
    redrawUnderlines();
  }

  function ignoreWord() {
    const place = openPopover?.place;
    closePopover(true);
    if (!place) return;
    ignoredWords.add(place.word);
    log({ type: 'ignore', word: place.word });
    redrawUnderlines();
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
    isPopoverOpen: () => !!openPopover,
    release,
  };
}
