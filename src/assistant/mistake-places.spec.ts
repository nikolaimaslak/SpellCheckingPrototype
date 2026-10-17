import { expect, test } from '@playwright/test';
import type { Mistake } from './llm';
import { findMistakesInText } from './mistake-places';

test('findMistakesInText places a mistake by its context, also in Arabic', () => {
  const you: Mistake = {
    word: 'you',
    surroundingText: 'you details',
    fixes: ['your'],
    isSure: true,
  };
  const places = findMistakesInText('to you and you details', [you]);
  expect(places.map((place) => [place.word, place.start, place.end])).toEqual([['you', 11, 14]]);

  const thanks: Mistake = {
    word: 'شكرا',
    surroundingText: 'شكرا لتواصلك',
    fixes: ['شكراً'],
    isSure: true,
  };
  const arabic = findMistakesInText('شكرا لتواصلك معنا', [thanks]);
  expect(arabic.map((place) => place.start)).toEqual([0]);
});

test('findMistakesInText drops a mistake whose word is twice in its context', () => {
  const the: Mistake = {
    word: 'the',
    surroundingText: 'the the form',
    fixes: ['the'],
    isSure: true,
  };
  expect(findMistakesInText('the the form', [the])).toEqual([]);
});
