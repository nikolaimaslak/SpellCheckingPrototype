import { expect, test } from '@playwright/test';
import { createAssistant, type AssistantOptions, type AssistEvent, type EditorControl, type KeyPress, type LLMClient, type TextSpan } from '.';

interface FakeLLMAnswer {
  mistakes: {
    word: string;
    context: string;
    fixes: string[];
    sure: boolean;
  }[];
  nextSentence: string;
}

function createTextEditorControl(text: string) {
  const memory = {
    text,
    caret: text.length,
    underlines: [] as TextSpan[],
  };
  const editorControl: EditorControl = {
    getText: () => memory.text,
    getCaret: () => memory.caret,
    setCaret: (offset) => {
      memory.caret = offset;
    },
    replaceText(start, end, inserted) {
      memory.text = memory.text.slice(0, start) + inserted + memory.text.slice(end);
      memory.caret = start + inserted.length;
    },
    showUnderlines: (spans) => {
      memory.underlines = spans;
    },
    showAutoCorrectedWords: () => {},
  };
  return { editorControl, memory };
}

function startAssistant(editorControl: EditorControl, answer: FakeLLMAnswer) {
  const llmClient: LLMClient = {
    ask: async () => ({ answer: JSON.stringify(answer) }),
  };
  const events: AssistEvent[] = [];
  const options: AssistantOptions = {
    llmClient,
    spellCheckMode: 'auto-correct',
    withAutoCompletion: true,
    isMac: false,
    debounceMs: 10,
    customDictionary: [],
    ignoredWords: [],
    onIgnoredWordsChange: () => {},
    llmContext: '',
    log: (event) => events.push(event),
  };
  return { assistant: createAssistant(editorControl, options), events };
}

test('without a DOM, a sure mistake is auto-corrected through the editor control', async () => {
  const { editorControl, memory } = createTextEditorControl('I will sen the form');
  const { assistant, events } = startAssistant(editorControl, {
    mistakes: [
      {
        word: 'sen',
        context: 'will sen the',
        fixes: ['send'],
        sure: true,
      },
    ],
    nextSentence: '',
  });
  assistant.handleInput({ inputType: 'insertText', data: 'm' });
  await expect.poll(() => events.some((event) => event.type === 'auto-correct')).toBe(true);
  expect(memory.text).toBe('I will send the form');
  expect(memory.caret).toBe('I will send the form'.length);
  assistant.release();
});

test('without a DOM, the auto-completion shows in the state and Tab inserts it', async () => {
  const { editorControl, memory } = createTextEditorControl('Your request was received');
  const { assistant } = startAssistant(editorControl, { mistakes: [], nextSentence: ' and will be done.' });
  assistant.handleInput({ inputType: 'insertText', data: 'd' });
  await expect.poll(() => assistant.getState().autoCompletion?.text).toBe(' and will be done.');

  const tab: KeyPress = {
    key: 'Tab',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  expect(assistant.handleKeyDown(tab)).toBe(true);
  expect(memory.text).toBe('Your request was received and will be done.');
  assistant.release();
});
