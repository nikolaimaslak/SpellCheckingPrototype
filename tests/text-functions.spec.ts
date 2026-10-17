import { expect, test } from '@playwright/test';
import { buildCompletionMessage, buildSpellingMessage, parseCompletion, parseMistakes, type CompletionRequest, type Mistake, type SpellingRequest } from '../src/assistant/llm';
import { findMistakesInText } from '../src/assistant/text/mistake-places';
import { directionOfLastWord } from '../src/assistant/text/words';

test('findMistakesInText places a mistake by its context, also in Arabic', () => {
  const you: Mistake = {
    word: 'you',
    context: 'you details',
    fixes: ['your'],
    isSure: true,
  };
  const places = findMistakesInText('to you and you details', [you]);
  expect(places.map((place) => [place.word, place.start, place.end])).toEqual([['you', 11, 14]]);

  const thanks: Mistake = {
    word: 'شكرا',
    context: 'شكرا لتواصلك',
    fixes: ['شكراً'],
    isSure: true,
  };
  const arabic = findMistakesInText('شكرا لتواصلك معنا', [thanks]);
  expect(arabic.map((place) => place.start)).toEqual([0]);
});

test('findMistakesInText drops a mistake whose word is twice in its context', () => {
  const the: Mistake = {
    word: 'the',
    context: 'the the form',
    fixes: ['the'],
    isSure: true,
  };
  expect(findMistakesInText('the the form', [the])).toEqual([]);
});

test('the spelling message has the word lists and the caret, the completion message asks to complete at the caret', () => {
  const spellingRequest: SpellingRequest = {
    draft: 'Hi Sasha,\nBest regards',
    caretOffset: 9,
    llmContext: 'Agent:\n- Name: Daniel',
    customWords: ['GOSI'],
    ignoredWords: [],
  };
  expect(buildSpellingMessage(spellingRequest)).toBe("Agent:\n- Name: Daniel\n\nCustom words:\n- GOSI\n\nDraft:\nHi Sasha,‸\nBest regards");
  expect(buildSpellingMessage({ ...spellingRequest, caretOffset: undefined })).not.toContain('‸');

  const completionRequest: CompletionRequest = {
    draft: 'Hi Sasha,\nBest regards',
    caretOffset: 9,
    isCaretOnNewLine: false,
    llmContext: 'Agent:\n- Name: Daniel',
  };
  expect(buildCompletionMessage(completionRequest)).toBe(
    "Agent:\n- Name: Daniel\n\nDraft:\nHi Sasha,‸\nBest regards\n\nComplete the draft at ‸ with one short sentence.",
  );
});

test('parseMistakes keeps well-formed mistakes, parseCompletion reads the next sentence', () => {
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
  });
  const sen: Mistake = {
    word: 'sen',
    context: 'will sen',
    fixes: ['send'],
    isSure: true,
  };
  expect(parseMistakes(reply)).toEqual([sen]);
  expect(parseMistakes('not json')).toBeNull();
  expect(parseCompletion('{"nextSentence": " to you."}')).toBe(' to you.');
  expect(parseCompletion('{}')).toBe('');
  expect(parseCompletion('not json')).toBeNull();
});

test('text direction follows the letters', () => {
  expect(directionOfLastWord('Hello سارة')).toBe('rtl');
  expect(directionOfLastWord('مرحبا Sasha')).toBe('ltr');
});
