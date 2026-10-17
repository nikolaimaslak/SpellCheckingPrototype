import type { Mistake } from './llm';
import { findMistakesInText, type PlacedMistake } from './mistake-places';
import { directionOfLastWord, findWordPlaces, type WordPlace } from './words';
import type { AssistantContext, TextSpan } from './types';
import { trace } from './trace';

const AUTO_CORRECTED_FLASH_MS = 2000;

export function stopSpellCheck(context: AssistantContext) {
  closePopover(context);
  context.editorControl.showUnderlines([]);
}

function mistakePlaces(context: AssistantContext, text: string): PlacedMistake[] {
  return findMistakesInText(text, context.spellCheck.mistakes).filter((place) => !context.customDictionary.has(place.word));
}

function finishedMistakePlaces(context: AssistantContext): PlacedMistake[] {
  const text = context.editorControl.getText();
  const caret = context.editorControl.getCaret();
  const isFollowedByBoundary = (place: PlacedMistake) => /^[^\p{L}\p{M}\p{N}]/u.test(text.slice(place.end));
  return mistakePlaces(context, text).filter((place) => place.end !== caret && isFollowedByBoundary(place));
}

export function displayAndAutoCorrectMistakes(context: AssistantContext, newMistakes: Mistake[]) {
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

interface WordFix {
  place: WordPlace;
  fix: string;
}

function replaceWords(context: AssistantContext, wordFixes: WordFix[]): WordFix[] {
  context.isAutoCorrecting = true;
  try {
    return replaceWordsNow(context, wordFixes);
  } finally {
    context.isAutoCorrecting = false;
  }
}

function replaceWordsNow(context: AssistantContext, wordFixes: WordFix[]): WordFix[] {
  const caretBefore = context.editorControl.getCaret();
  const lastFirst = [...wordFixes].sort((first, second) => second.place.start - first.place.start);
  const applied: WordFix[] = [];
  const autoCorrectedSpans: { start: number; length: number }[] = [];
  let caretShift = 0;

  for (const wordFix of lastFirst) {
    const { place } = wordFix;
    if (context.editorControl.getText().slice(place.start, place.end) !== place.word) {
      trace('auto-correct', `skipped "${place.word}" @${place.start}: the text there changed`);
      continue;
    }
    trace('auto-correct', `"${place.word}" @${place.start} → "${wordFix.fix}" (native edit: one Ctrl/Cmd+Z)`);

    context.editorControl.replaceText(place.start, place.end, wordFix.fix);
    const lengthChange = wordFix.fix.length - place.word.length;
    if (caretBefore !== undefined && place.end <= caretBefore) {
      caretShift += lengthChange;
    }
    autoCorrectedSpans.forEach((span) => (span.start += lengthChange));
    autoCorrectedSpans.push({ start: place.start, length: wordFix.fix.length });
    applied.push(wordFix);
  }
  if (!applied.length) {
    return applied;
  }

  if (caretBefore !== undefined) {
    trace('auto-correct', `caret put back: ${caretBefore} → ${caretBefore + caretShift}`);
    context.editorControl.setCaret(caretBefore + caretShift);
  }
  flash(context, autoCorrectedSpans.map((span) => ({ start: span.start, end: span.start + span.length })));
  return applied.reverse();
}

function flash(context: AssistantContext, spans: TextSpan[]) {
  context.editorControl.showAutoCorrectedWords(spans);
  clearTimeout(context.autoCorrectedFlashTimer);
  context.autoCorrectedFlashTimer = setTimeout(() => context.editorControl.showAutoCorrectedWords([]), AUTO_CORRECTED_FLASH_MS);
}

function autoCorrectSureMistakes(context: AssistantContext) {
  const placesToFix = finishedMistakePlaces(context).filter((place) => place.mistake.isSure);
  if (placesToFix.length) {
    trace('spell-check', `auto-correcting ${placesToFix.length} word(s)`, placesToFix.map((place) => `${place.word} → ${place.mistake.fixes[0]}`));
  }
  const wordFixes = placesToFix.map((place) => ({ place, fix: place.mistake.fixes[0] }));
  for (const { place, fix } of replaceWords(context, wordFixes)) {
    context.spellCheck.fixByOriginal.set(place.word, fix);
    context.log({
      type: 'auto-correct',
      original: place.word,
      fix,
    });
  }
}

export function noticeUndo(context: AssistantContext) {
  const text = context.editorControl.getText();
  for (const [original, fix] of context.spellCheck.fixByOriginal) {
    if (!findWordPlaces(text, [original]).length) {
      continue;
    }
    trace('spell-check', `Ctrl/Cmd+Z brought back "${original}": it is now ignored and never auto-corrected again`);
    context.spellCheck.fixByOriginal.delete(original);
    context.spellCheck.undoneAutoCorrections.push({ original, fix });
    addIgnoredWord(context, original);
    context.log({
      type: 'auto-correct-undo',
      original,
      fix,
    });
  }
}

export function noticeRedo(context: AssistantContext) {
  const text = context.editorControl.getText();
  const redone = context.spellCheck.undoneAutoCorrections.filter(({ original }) => !findWordPlaces(text, [original]).length);
  for (const { original, fix } of redone) {
    trace('spell-check', `Ctrl/Cmd+Shift+Z brought back "${fix}": "${original}" is no longer ignored`);
    context.spellCheck.fixByOriginal.set(original, fix);
    context.ignoredWords = context.ignoredWords.filter((word) => word !== original);
    context.log({
      type: 'auto-correct-redo',
      original,
      fix,
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
      start: place.start,
      end: place.end,
      direction: directionOfLastWord(place.word),
      fixes: place.mistake.fixes,
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

export function pickFix(context: AssistantContext, fix: string) {
  const place = context.spellCheck.openPopover?.place;
  closePopover(context, true);
  if (!place || context.editorControl.getText().slice(place.start, place.end) !== place.word) {
    trace('spell-check', 'pick ignored: the word changed while the popover was open');
    return;
  }
  trace('spell-check', `picked "${fix}" for "${place.word}"`);
  context.editorControl.replaceText(place.start, place.end, fix);
  context.log({
    type: 'pick-fix',
    original: place.word,
    fix,
  });
  redrawUnderlines(context);
}

function addIgnoredWord(context: AssistantContext, word: string) {
  context.ignoredWords = [...new Set([...context.ignoredWords, word])];
  context.options.onIgnoredWordsChange(context.ignoredWords);
}

export function addToDictionary(context: AssistantContext, word: string) {
  context.customDictionary.add(word);
  context.options.onCustomDictionaryChange([...context.customDictionary]);
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
  context.log({ type: 'ignore-word', word: place.word });
}
