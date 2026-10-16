import { expect, test } from '@playwright/test';
import { wordDiff } from '../src/assistant/fix-spelling/word-diff';
import { buildUserMessage, parseAnswer, type CheckRequest } from '../src/assistant/llm';
import { findMistakesInText } from '../src/assistant/text/mistake-places';
import { directionOfLastWord, directionOfText } from '../src/assistant/text/words';

test('wordDiff marks the replaced word', () => {
  expect(wordDiff('I will sen it', 'I will send it')).toEqual([
    { type: 'same', text: 'I will ' },
    { type: 'removed', text: 'sen' },
    { type: 'added', text: 'send' },
    { type: 'same', text: ' it' },
  ]);
});

test('findMistakesInText places a mistake by its context, also in Arabic', () => {
  const places = findMistakesInText('to you and you details', [{ word: 'you', context: 'you details', fixes: ['your'], sure: true }]);
  expect(places.map(({ word, start, end }) => ({ word, start, end }))).toEqual([{ word: 'you', start: 11, end: 14 }]);

  const arabic = findMistakesInText('شكرا لتواصلك معنا', [{ word: 'شكرا', context: 'شكرا لتواصلك', fixes: ['شكراً'], sure: true }]);
  expect(arabic.map((place) => place.start)).toEqual([0]);
});

test('findMistakesInText drops a mistake whose word is twice in its context', () => {
  expect(findMistakesInText('the the form', [{ word: 'the', context: 'the the form', fixes: ['the'], sure: true }])).toEqual([]);
});

test('buildUserMessage puts ‸ at the caret only when a completion is asked for', () => {
  const request: CheckRequest = {
    draft: 'Hi Sasha,\nBest regards',
    shouldAskCompletion: true,
    caretOffset: 9,
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
    mistakes: [{ word: 'sen', context: 'will sen', fixes: ['send', 3], sure: true }, { word: 'x' }, { word: 'y', context: 'y', fixes: [] }],
    nextSentence: ' to you.',
  });
  expect(parseAnswer(reply)).toEqual({ mistakes: [{ word: 'sen', context: 'will sen', fixes: ['send'], sure: true }], completion: ' to you.' });
  expect(parseAnswer('not json')).toBeNull();
});

test('text direction follows the letters', () => {
  expect(directionOfText('Hello سارة')).toBe('ltr');
  expect(directionOfText('مرحبا سارة hi')).toBe('rtl');
  expect(directionOfLastWord('Hello سارة')).toBe('rtl');
  expect(directionOfLastWord('مرحبا Sasha')).toBe('ltr');
});
