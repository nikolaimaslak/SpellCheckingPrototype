import { expect, test } from '@playwright/test';
import { buildUserMessage, parseAnswer, type CheckRequest, type Mistake } from '../src/assistant/llm';
import { findMistakesInText } from '../src/assistant/text/mistake-places';
import { directionOfLastWord } from '../src/assistant/text/words';

test('findMistakesInText places a mistake by its context, also in Arabic', () => {
  const you: Mistake = {
    word: 'you',
    context: 'you details',
    fixes: ['your'],
    sure: true,
  };
  const places = findMistakesInText('to you and you details', [you]);
  expect(places.map((place) => [place.word, place.start, place.end])).toEqual([['you', 11, 14]]);

  const thanks: Mistake = {
    word: 'شكرا',
    context: 'شكرا لتواصلك',
    fixes: ['شكراً'],
    sure: true,
  };
  const arabic = findMistakesInText('شكرا لتواصلك معنا', [thanks]);
  expect(arabic.map((place) => place.start)).toEqual([0]);
});

test('findMistakesInText drops a mistake whose word is twice in its context', () => {
  const the: Mistake = {
    word: 'the',
    context: 'the the form',
    fixes: ['the'],
    sure: true,
  };
  expect(findMistakesInText('the the form', [the])).toEqual([]);
});

test('buildUserMessage puts ‸ at the caret only when a completion is asked for', () => {
  const request: CheckRequest = {
    draft: 'Hi Sasha,\nBest regards',
    shouldAskCompletion: true,
    caretOffset: 9,
    isCaretOnNewLine: false,
    llmContext: 'Agent:\n- Name: Daniel',
    customWords: ['GOSI'],
    ignoredWords: [],
  };
  expect(buildUserMessage(request)).toBe(
    "Agent:\n- Name: Daniel\n\nCustom words:\n- GOSI\n\nAgent's draft:\nHi Sasha,‸\nBest regards\n\nComplete the draft at ‸ with one short sentence.",
  );
  expect(buildUserMessage({ ...request, shouldAskCompletion: false })).not.toContain('‸');
});

test('parseAnswer keeps well-formed mistakes and reads the next sentence', () => {
  const reply = JSON.stringify({
    mistakes: [
      {
        word: 'sen',
        context: 'will sen',
        fixes: ['send', 3],
        sure: true,
      },
      { word: 'x' },
      {
        word: 'y',
        context: 'y',
        fixes: [],
      },
    ],
    nextSentence: ' to you.',
  });
  const sen: Mistake = {
    word: 'sen',
    context: 'will sen',
    fixes: ['send'],
    sure: true,
  };
  expect(parseAnswer(reply)).toEqual({ mistakes: [sen], completion: ' to you.' });
  expect(parseAnswer('not json')).toBeNull();
});

test('text direction follows the letters', () => {
  expect(directionOfLastWord('Hello سارة')).toBe('rtl');
  expect(directionOfLastWord('مرحبا Sasha')).toBe('ltr');
});
