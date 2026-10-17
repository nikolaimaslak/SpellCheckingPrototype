import { removeHighlight, replaceText, restoreSelection, selectedRange, showHighlight } from '../browser';
import type { Mistake } from '../llm';
import { caretOffset, placeCaret, rangeOf, readFieldText, type FieldText } from '../text/field-text';
import { findMistakesInText, type PlacedMistake } from '../text/mistake-places';
import { directionOfLastWord, findWordPlaces, type WordPlace } from '../text/words';
import type { AssistantContext } from '../types';
import { trace } from '../trace';

const SPELLING_ERROR_HIGHLIGHT = 'bp-spelling-error';
const REPLACED_HIGHLIGHT = 'bp-autocorrected';
const REPLACED_FLASH_MS = 2000;

export function stopSpelling(context: AssistantContext) {
  closePopover(context);
  removeHighlight(SPELLING_ERROR_HIGHLIGHT);
}

function mistakePlaces(context: AssistantContext, text: string): PlacedMistake[] {
  return findMistakesInText(text, context.spelling.mistakes).filter((place) => !context.customWords.has(place.word));
}

function finishedMistakePlaces(context: AssistantContext, fieldText: FieldText): PlacedMistake[] {
  const caret = caretOffset(fieldText);
  const isFollowedByBoundary = (place: PlacedMistake) => /^[^\p{L}\p{M}\p{N}]/u.test(fieldText.text.slice(place.end));
  return mistakePlaces(context, fieldText.text).filter((place) => place.end !== caret && isFollowedByBoundary(place));
}

export function displayAndAutocorrectMistakes(context: AssistantContext, newMistakes: Mistake[]) {
  context.spelling.mistakes = newMistakes;
  const fieldText = readFieldText(context.field);
  const placed = findMistakesInText(fieldText.text, newMistakes);
  const notFound = newMistakes.filter((mistake) => !placed.some((place) => place.mistake === mistake));
  trace('spelling', `model reported ${newMistakes.length} mistake(s); ${placed.length} place(s) found in the field`, placed.map((place) => `${place.word} @${place.start} → ${place.mistake.fixes.join(' / ')}${place.mistake.sure ? ' (sure)' : ''}`));
  if (notFound.length) {
    trace('spelling', 'context not found in the field (text changed, or the model did not copy it exactly): ignored', notFound);
  }
  if (context.options.spellCheckMode === 'auto-correct') {
    autoCorrectSureMistakes(context);
  } else {
    trace('spelling', 'auto-correct is off: mistakes are only underlined');
  }
  redrawUnderlines(context);
}

export function redrawUnderlines(context: AssistantContext) {
  const fieldText = readFieldText(context.field);
  if (!fieldText.text.trim()) {
    context.spelling.mistakes = [];
  }
  const underlined = mistakePlaces(context, fieldText.text);
  showHighlight(SPELLING_ERROR_HIGHLIGHT, underlined.map((place) => rangeOf(fieldText, place.start, place.end)));
}

interface WordReplacement {
  place: WordPlace;
  replacement: string;
}

function replaceWords(context: AssistantContext, replacements: WordReplacement[]): WordReplacement[] {
  context.isReplacingWords = true;
  try {
    return replaceWordsNow(context, replacements);
  } finally {
    context.isReplacingWords = false;
  }
}

function replaceWordsNow(context: AssistantContext, replacements: WordReplacement[]): WordReplacement[] {
  const { field } = context;
  const caretBefore = caretOffset(readFieldText(field));
  const selectionBefore = selectedRange();
  const isCaretOnEmptyLine = selectionBefore?.startContainer.nodeType === Node.ELEMENT_NODE;
  const lastFirst = [...replacements].sort((first, second) => second.place.start - first.place.start);
  const applied: WordReplacement[] = [];
  const replacedSpans: { start: number; length: number }[] = [];
  let caretShift = 0;

  for (const replacement of lastFirst) {
    const { place } = replacement;
    const currentText = readFieldText(field);
    if (currentText.text.slice(place.start, place.end) !== place.word) {
      trace('replace', `skipped "${place.word}" @${place.start}: the text there changed`);
      continue;
    }
    trace('replace', `"${place.word}" @${place.start} → "${replacement.replacement}" (native edit: one Ctrl/Cmd+Z)`);

    replaceText(field, rangeOf(currentText, place.start, place.end), replacement.replacement);
    const lengthChange = replacement.replacement.length - place.word.length;
    if (caretBefore !== undefined && place.end <= caretBefore) {
      caretShift += lengthChange;
    }
    replacedSpans.forEach((span) => (span.start += lengthChange));
    replacedSpans.push({ start: place.start, length: replacement.replacement.length });
    applied.push(replacement);
  }
  if (!applied.length) {
    return applied;
  }

  const textAfter = readFieldText(field);
  if (isCaretOnEmptyLine && selectionBefore) {
    trace('replace', 'caret put back on its empty line');
    restoreSelection(field, selectionBefore);
  } else if (caretBefore !== undefined) {
    trace('replace', `caret put back: ${caretBefore} → ${caretBefore + caretShift}`);
    placeCaret(textAfter, caretBefore + caretShift);
  }
  flash(context, replacedSpans.map((span) => rangeOf(textAfter, span.start, span.start + span.length)));
  return applied.reverse();
}

function flash(context: AssistantContext, ranges: Range[]) {
  showHighlight(REPLACED_HIGHLIGHT, ranges);
  clearTimeout(context.replacedFlashTimer);
  context.replacedFlashTimer = setTimeout(() => showHighlight(REPLACED_HIGHLIGHT, []), REPLACED_FLASH_MS);
}

function autoCorrectSureMistakes(context: AssistantContext) {
  const placesToFix = finishedMistakePlaces(context, readFieldText(context.field)).filter((place) => place.mistake.sure);
  if (placesToFix.length) {
    trace('spelling', `auto-correcting ${placesToFix.length} word(s)`, placesToFix.map((place) => `${place.word} → ${place.mistake.fixes[0]}`));
  }
  const replacements = placesToFix.map((place) => ({ place, replacement: place.mistake.fixes[0] }));
  for (const { place, replacement } of replaceWords(context, replacements)) {
    context.spelling.replacementByOriginal.set(place.word, replacement);
    context.log({
      type: 'autocorrect',
      original: place.word,
      replacement,
    });
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
    context.spelling.undoneAutoCorrections.push({ original, replacement });
    addIgnoredWord(context, original);
    context.log({
      type: 'revert',
      original,
      replacement,
    });
  }
}

export function noticeRedo(context: AssistantContext) {
  const fieldText = readFieldText(context.field).text;
  const { spelling } = context;
  const redone = spelling.undoneAutoCorrections.filter(({ original }) => !findWordPlaces(fieldText, [original]).length);
  for (const { original, replacement } of redone) {
    trace('spelling', `Ctrl/Cmd+Shift+Z brought back "${replacement}": "${original}" is no longer ignored`);
    spelling.replacementByOriginal.set(original, replacement);
    context.ignoredWords = context.ignoredWords.filter((word) => word !== original);
    context.log({
      type: 'autocorrect',
      original,
      replacement,
    });
  }
  if (redone.length) {
    spelling.undoneAutoCorrections = spelling.undoneAutoCorrections.filter((undone) => !redone.includes(undone));
    context.options.onIgnoredWordsChange(context.ignoredWords);
  }
}

export function openPopoverAtCaret(context: AssistantContext): boolean {
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
      suggestions: place.mistake.fixes,
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
  if (returnCaret && closing.selectionBefore) {
    restoreSelection(context.field, closing.selectionBefore);
  }
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
  context.log({
    type: 'pick',
    original: place.word,
    replacement: suggestion,
  });
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
