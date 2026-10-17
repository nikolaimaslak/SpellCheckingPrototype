import type { Mistake } from './llm';
import { findMistakesInText, type PlacedMistake } from './mistake-places';
import { directionOfLastWord, findWordPlaces, type WordPlace } from './words';
import type { AssistantContext, TextSpan } from './types';
import { trace } from './trace';

const REPLACED_FLASH_MS = 2000;

export function stopSpellCheck(context: AssistantContext) {
  closePopover(context);
  context.editorControl.showUnderlines([]);
}

function mistakePlaces(context: AssistantContext, text: string): PlacedMistake[] {
  return findMistakesInText(text, context.spellCheck.mistakes).filter((place) => !context.customWords.has(place.word));
}

function finishedMistakePlaces(context: AssistantContext): PlacedMistake[] {
  const text = context.editorControl.getText();
  const caret = context.editorControl.getCaret();
  const isFollowedByBoundary = (place: PlacedMistake) => /^[^\p{L}\p{M}\p{N}]/u.test(text.slice(place.end));
  return mistakePlaces(context, text).filter((place) => place.end !== caret && isFollowedByBoundary(place));
}

export function displayAndAutocorrectMistakes(context: AssistantContext, newMistakes: Mistake[]) {
  context.spellCheck.mistakes = newMistakes;
  const placed = findMistakesInText(context.editorControl.getText(), newMistakes);
  const notFound = newMistakes.filter((mistake) => !placed.some((place) => place.mistake === mistake));
  trace('spell-check', `model reported ${newMistakes.length} mistake(s); ${placed.length} place(s) found in the field`, placed.map((place) => `${place.word} @${place.start} → ${place.mistake.fixes.join(' / ')}${place.mistake.isSure ? ' (sure)' : ''}`));
  if (notFound.length) {
    trace('spell-check', 'context not found in the field (text changed, or the model did not copy it exactly): ignored', notFound);
  }
  if (context.options.spellCheckMode === 'auto-correct') {
    autoCorrectSureMistakes(context);
  } else {
    trace('spell-check', 'auto-correct is off: mistakes are only underlined');
  }
  redrawUnderlines(context);
}

export function redrawUnderlines(context: AssistantContext) {
  const text = context.editorControl.getText();
  if (!text.trim()) {
    context.spellCheck.mistakes = [];
  }
  context.editorControl.showUnderlines(mistakePlaces(context, text).map((place) => ({ start: place.start, end: place.end })));
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
  const caretBefore = context.editorControl.getCaret();
  const lastFirst = [...replacements].sort((first, second) => second.place.start - first.place.start);
  const applied: WordReplacement[] = [];
  const replacedSpans: { start: number; length: number }[] = [];
  let caretShift = 0;

  for (const replacement of lastFirst) {
    const { place } = replacement;
    if (context.editorControl.getText().slice(place.start, place.end) !== place.word) {
      trace('replace', `skipped "${place.word}" @${place.start}: the text there changed`);
      continue;
    }
    trace('replace', `"${place.word}" @${place.start} → "${replacement.replacement}" (native edit: one Ctrl/Cmd+Z)`);

    context.editorControl.replaceText(place.start, place.end, replacement.replacement);
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

  if (caretBefore !== undefined) {
    trace('replace', `caret put back: ${caretBefore} → ${caretBefore + caretShift}`);
    context.editorControl.setCaret(caretBefore + caretShift);
  }
  flash(context, replacedSpans.map((span) => ({ start: span.start, end: span.start + span.length })));
  return applied.reverse();
}

function flash(context: AssistantContext, spans: TextSpan[]) {
  context.editorControl.showReplacedWords(spans);
  clearTimeout(context.replacedFlashTimer);
  context.replacedFlashTimer = setTimeout(() => context.editorControl.showReplacedWords([]), REPLACED_FLASH_MS);
}

function autoCorrectSureMistakes(context: AssistantContext) {
  const placesToFix = finishedMistakePlaces(context).filter((place) => place.mistake.isSure);
  if (placesToFix.length) {
    trace('spell-check', `auto-correcting ${placesToFix.length} word(s)`, placesToFix.map((place) => `${place.word} → ${place.mistake.fixes[0]}`));
  }
  const replacements = placesToFix.map((place) => ({ place, replacement: place.mistake.fixes[0] }));
  for (const { place, replacement } of replaceWords(context, replacements)) {
    context.spellCheck.replacementByOriginal.set(place.word, replacement);
    context.log({
      type: 'autocorrect',
      original: place.word,
      replacement,
    });
  }
}

export function noticeUndo(context: AssistantContext) {
  const fieldText = context.editorControl.getText();
  for (const [original, replacement] of context.spellCheck.replacementByOriginal) {
    if (!findWordPlaces(fieldText, [original]).length) {
      continue;
    }
    trace('spell-check', `Ctrl/Cmd+Z brought back "${original}": it is now ignored and never auto-corrected again`);
    context.spellCheck.replacementByOriginal.delete(original);
    context.spellCheck.undoneAutoCorrections.push({ original, replacement });
    addIgnoredWord(context, original);
    context.log({
      type: 'revert',
      original,
      replacement,
    });
  }
}

export function noticeRedo(context: AssistantContext) {
  const fieldText = context.editorControl.getText();
  const redone = context.spellCheck.undoneAutoCorrections.filter(({ original }) => !findWordPlaces(fieldText, [original]).length);
  for (const { original, replacement } of redone) {
    trace('spell-check', `Ctrl/Cmd+Shift+Z brought back "${replacement}": "${original}" is no longer ignored`);
    context.spellCheck.replacementByOriginal.set(original, replacement);
    context.ignoredWords = context.ignoredWords.filter((word) => word !== original);
    context.log({
      type: 'autocorrect',
      original,
      replacement,
    });
  }
  if (redone.length) {
    context.spellCheck.undoneAutoCorrections = context.spellCheck.undoneAutoCorrections.filter((undone) => !redone.includes(undone));
    context.options.onIgnoredWordsChange(context.ignoredWords);
  }
}

export function openPopoverAtCaret(context: AssistantContext): boolean {
  const caret = context.editorControl.getCaret();
  if (caret === undefined) {
    return false;
  }
  const place = mistakePlaces(context, context.editorControl.getText()).find((candidate) => candidate.start <= caret && caret <= candidate.end);
  if (!place) {
    return false;
  }

  trace('spell-check', `popover opened for "${place.word}"`, place.mistake.fixes);
  context.spellCheck.openPopover = { place, caretBefore: caret };
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

export function closePopover(context: AssistantContext, shouldReturnCaret = false) {
  const closing = context.spellCheck.openPopover;
  if (!closing) {
    return;
  }
  context.spellCheck.openPopover = undefined;
  context.setState({ popover: undefined });
  if (shouldReturnCaret && closing.caretBefore !== undefined) {
    context.editorControl.setCaret(closing.caretBefore);
  }
}

export function pickSuggestion(context: AssistantContext, suggestion: string) {
  const place = context.spellCheck.openPopover?.place;
  closePopover(context, true);
  if (!place || context.editorControl.getText().slice(place.start, place.end) !== place.word) {
    trace('spell-check', 'pick ignored: the word changed while the popover was open');
    return;
  }
  trace('spell-check', `picked "${suggestion}" for "${place.word}"`);
  context.editorControl.replaceText(place.start, place.end, suggestion);
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
  trace('spell-check', `"${word}" added to the custom dictionary`);
  closePopover(context, true);
  redrawUnderlines(context);
}

export function ignoreWord(context: AssistantContext) {
  const place = context.spellCheck.openPopover?.place;
  closePopover(context, true);
  if (!place) {
    return;
  }
  addIgnoredWord(context, place.word);
  trace('spell-check', `"${place.word}" added to the ignored words: never auto-corrected`);
  context.log({ type: 'ignore', word: place.word });
}
