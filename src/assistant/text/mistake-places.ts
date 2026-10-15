import type { Mistake } from '../openai/check-request';
import { findWordPlaces, type WordPlace } from './words';

export interface PlacedMistake extends WordPlace {
  mistake: Mistake;
}

const withPlainSpaces = (text: string) => text.replace(/\u00A0/g, ' ');

export function placeMistakes(fieldText: string, mistakes: Mistake[]): PlacedMistake[] {
  const text = withPlainSpaces(fieldText);
  const placesByStart = new Map<number, PlacedMistake>();
  for (const mistake of mistakes) {
    const context = withPlainSpaces(mistake.context);
    const wordInContext = findWordPlaces(context, [mistake.word])[0];
    if (!wordInContext) continue;
    for (let contextStart = text.indexOf(context); contextStart !== -1; contextStart = text.indexOf(context, contextStart + 1)) {
      const start = contextStart + wordInContext.start;
      placesByStart.set(start, { word: mistake.word, start, end: start + mistake.word.length, mistake });
    }
  }
  return [...placesByStart.values()].sort((first, second) => first.start - second.start);
}
