import { createHighlight, replaceText } from './browser';
import { caretOffset, placeCaret, rangeOf, readFieldText } from './text/field-text';
import type { WordPlace } from './text/words';
import { trace } from './trace';

export interface WordReplacement {
  place: WordPlace;
  replacement: string;
}

const REPLACED_HIGHLIGHT = 'bp-autocorrected';
const REPLACED_FLASH_MS = 2000;

let replacedFlash: ReturnType<typeof createHighlight> | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

export function replaceWords(field: HTMLElement, replacements: WordReplacement[]): WordReplacement[] {
  const caretBefore = caretOffset(readFieldText(field));
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
    if (caretBefore !== undefined && place.end <= caretBefore) caretShift += lengthChange;
    replacedSpans.forEach((span) => (span.start += lengthChange));
    replacedSpans.push({ start: place.start, length: replacement.replacement.length });
    applied.push(replacement);
  }
  if (!applied.length) return applied;

  const textAfter = readFieldText(field);
  if (caretBefore !== undefined) {
    trace('replace', `caret put back: ${caretBefore} → ${caretBefore + caretShift}`);
    placeCaret(textAfter, caretBefore + caretShift);
  }
  flash(replacedSpans.map((span) => rangeOf(textAfter, span.start, span.start + span.length)));
  return applied.reverse();
}

function flash(ranges: Range[]) {
  replacedFlash ??= createHighlight(REPLACED_HIGHLIGHT);
  replacedFlash.show(ranges);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => replacedFlash?.show([]), REPLACED_FLASH_MS);
}
