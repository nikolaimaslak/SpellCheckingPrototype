import { expect, type Page } from '@playwright/test';
import type { Mistake } from '../src/assistant/llm';

export interface FakeAnswer {
  mistakes?: Mistake[];
  nextSentence?: string;
}

export const ACCEPT_WORD_KEY = process.platform === 'darwin' ? 'Alt+ArrowRight' : 'Control+ArrowRight';
export const DEBOUNCE_MS = 1000;

const draftOf = (userMessage: string) => userMessage.split("Draft:\n")[1].split('\n\nComplete the draft')[0];

export async function openDemoPage(page: Page, answerFor: (draft: string) => FakeAnswer) {
  const userMessages: string[] = [];
  const spellingMessages: string[] = [];
  const completionMessages: string[] = [];
  await page.route('https://api.openai.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { content: string }[] };
    const userMessage = body.messages.at(-1)!.content;
    userMessages.push(userMessage);
    (userMessage.includes('Complete the draft at ‸') ? completionMessages : spellingMessages).push(userMessage);
    const draft = draftOf(userMessage);
    const answer: FakeAnswer = {
      mistakes: [],
      nextSentence: '',
      ...answerFor(draft),
    };
    const llmReply = {
      mistakes: answer.mistakes?.map(({ isSure, ...mistake }) => ({ ...mistake, sure: isSure })),
      nextSentence: answer.nextSentence,
    };
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(llmReply) } }] } });
  });
  await page.goto('/');
  await page.getByLabel('OpenAI API key').fill('test-key');
  const field = page.getByRole('textbox', { name: 'Agent message' });
  await expect(field).toHaveAttribute('contenteditable', 'true');
  const ghost = page.locator('div.fixed[aria-hidden="true"]');
  return {
    field,
    userMessages,
    ghostText: () => ghost.textContent({ timeout: 1000 }).catch(() => null),
    spellingMessages,
    completionMessages,
    spellingDrafts: () => spellingMessages.map(draftOf),
    completionDrafts: () => completionMessages.map(draftOf),
    waitPastDebounce: () => page.waitForTimeout(DEBOUNCE_MS * 1.5),
  };
}
