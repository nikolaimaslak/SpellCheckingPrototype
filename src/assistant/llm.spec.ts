import { expect, test } from '@playwright/test';
import { buildAutoCompletionMessage, buildSpellCheckMessage, parseAutoCompletion, parseMistakes, type AutoCompletionRequest, type Mistake, type SpellCheckRequest } from './llm';

test('the spell check message has the word lists and the caret, the auto-completion message asks to complete at the caret', () => {
  const spellCheckRequest: SpellCheckRequest = {
    draft: 'Hi Sasha,\nBest regards',
    caretOffset: 9,
    llmContext: 'Agent:\n- Name: Daniel',
    customDictionary: ['GOSI'],
    ignoredWords: [],
  };
  expect(buildSpellCheckMessage(spellCheckRequest)).toBe("Agent:\n- Name: Daniel\n\nCustom dictionary:\n- GOSI\n\nDraft:\nHi Sasha,‸\nBest regards");
  expect(buildSpellCheckMessage({ ...spellCheckRequest, caretOffset: undefined })).not.toContain('‸');

  const autoCompletionRequest: AutoCompletionRequest = {
    draft: 'Hi Sasha,\nBest regards',
    caretOffset: 9,
    isCaretOnNewLine: false,
    llmContext: 'Agent:\n- Name: Daniel',
  };
  expect(buildAutoCompletionMessage(autoCompletionRequest)).toBe(
    "Agent:\n- Name: Daniel\n\nDraft:\nHi Sasha,‸\nBest regards\n\nComplete the draft at ‸ with one short sentence.",
  );
});

test('parseMistakes keeps well-formed mistakes, parseAutoCompletion reads the next sentence', () => {
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
    surroundingText: 'will sen',
    fixes: ['send'],
    isSure: true,
  };
  expect(parseMistakes(reply)).toEqual([sen]);
  expect(parseMistakes('not json')).toBeNull();
  expect(parseAutoCompletion('{"nextSentence": " to you."}')).toBe(' to you.');
  expect(parseAutoCompletion('{}')).toBe('');
  expect(parseAutoCompletion('not json')).toBeNull();
});
