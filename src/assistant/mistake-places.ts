import type { Mistake } from './llm';
import { findWordPlaces, type WordPlace } from './words';

export interface PlacedMistake extends WordPlace {
  mistake: Mistake;
}

const withPlainSpaces = (text: string) => text.replace(/\u00A0/g, ' ');

export function findMistakesInText(text: string, mistakes: Mistake[]): PlacedMistake[] {
  const plainText = withPlainSpaces(text);
  const placesByStart = new Map<number, PlacedMistake>();
  for (const mistake of mistakes) {
    const surroundingText = withPlainSpaces(mistake.surroundingText);
    const wordsInSurroundingText = findWordPlaces(surroundingText, [mistake.word]);
    if (wordsInSurroundingText.length !== 1) {
      continue;
    }
    const wordInSurroundingText = wordsInSurroundingText[0];
    for (let surroundingTextStart = plainText.indexOf(surroundingText); surroundingTextStart !== -1; surroundingTextStart = plainText.indexOf(surroundingText, surroundingTextStart + 1)) {
      const start = surroundingTextStart + wordInSurroundingText.start;
      placesByStart.set(start, {
        word: mistake.word,
        start,
        end: start + mistake.word.length,
        mistake,
      });
    }
  }
  return [...placesByStart.values()].sort((first, second) => first.start - second.start);
}
