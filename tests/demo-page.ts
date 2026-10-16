import { expect, type Page } from '@playwright/test';
import type { Mistake } from '../src/assistant/llm';

export interface FakeAnswer {
  mistakes?: Mistake[];
  nextSentence?: string;
}

export const ACCEPT_WORD_KEY = process.platform === 'darwin' ? 'Alt+ArrowRight' : 'Control+ArrowRight';
export const DEBOUNCE_MS = 100;

export async function openDemoPage(page: Page, answerFor: (draft: string) => FakeAnswer) {
  const userMessages: string[] = [];
  await page.route('https://api.openai.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { content: string }[] };
    const userMessage = body.messages.at(-1)!.content;
    userMessages.push(userMessage);
    const draft = userMessage.split("Agent's draft:\n")[1].split('\n\nComplete the draft')[0];
    const answer: FakeAnswer = { mistakes: [], nextSentence: '', ...answerFor(draft) };
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(answer) } }] } });
  });
  await page.goto('/');
  await page.getByLabel('Debounce, ms').fill(String(DEBOUNCE_MS));
  await page.getByLabel('OpenAI API key').fill('test-key');
  await expect(page.getByRole('button', { name: 'Fix spelling' })).toBeEnabled();

  const field = page.getByRole('textbox', { name: 'Agent message' });
  const ghost = page.locator('div.fixed[aria-hidden="true"]');
  return {
    field,
    userMessages,
    ghostText: () => ghost.textContent({ timeout: 1000 }).catch(() => null),
    sentDrafts: () => userMessages.map((message) => message.split("Agent's draft:\n")[1].split('\n\nComplete the draft')[0]),
    waitPastDebounce: () => page.waitForTimeout(DEBOUNCE_MS * 4),
  };
}
