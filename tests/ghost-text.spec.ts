import { expect, test } from '@playwright/test';
import { ACCEPT_WORD_KEY, openDemoPage } from './demo-page';

const completionAfterReceived = (draft: string) => ({ nextSentence: draft.endsWith('received‸') ? ' and will be done.' : '' });

test('Tab accepts the completion as one insert', async ({ page }) => {
  const demo = await openDemoPage(page, completionAfterReceived);
  await demo.field.click();
  await page.keyboard.type('Your request was received');
  await expect.poll(demo.ghostText).toBe(' and will be done.');
  await page.keyboard.press('Tab');
  await expect(demo.field).toHaveText('Your request was received and will be done.');
  await expect.poll(demo.ghostText).toBe(null);
});

test('typing what the ghost says or accepting one word keeps the rest, with no new request', async ({ page }) => {
  const demo = await openDemoPage(page, () => ({ nextSentence: ' and will be done.' }));
  await demo.field.click();
  await page.keyboard.type('Your request was received');
  await expect.poll(demo.ghostText).toBe(' and will be done.');

  await page.keyboard.press(ACCEPT_WORD_KEY);
  await expect.poll(demo.ghostText).toBe(' will be done.');
  await page.keyboard.type(' will');
  await expect.poll(demo.ghostText).toBe(' be done.');
  await demo.waitPastDebounce();
  expect(demo.userMessages).toHaveLength(1);
});

test('typing something else or Escape hides the ghost', async ({ page }) => {
  const demo = await openDemoPage(page, completionAfterReceived);
  await demo.field.click();
  await page.keyboard.type('Your request was received');
  await expect.poll(demo.ghostText).toBe(' and will be done.');
  await page.keyboard.press('Escape');
  await expect.poll(demo.ghostText).toBe(null);

  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  await expect.poll(demo.ghostText).toBe(' and will be done.');
  await page.keyboard.type(' but');
  await expect.poll(demo.ghostText).toBe(null);
});

test('Enter moves the ghost to the new line without its leading space, with no new request', async ({ page }) => {
  const demo = await openDemoPage(page, () => ({ nextSentence: ' your request has been received.' }));
  await demo.field.click();
  await page.keyboard.type('Dear Sasha,');
  await expect.poll(demo.ghostText).toBe(' your request has been received.');

  await page.keyboard.press('Enter');
  await expect.poll(demo.ghostText).toBe('your request has been received.');
  await page.keyboard.press('Enter');
  await page.keyboard.press(ACCEPT_WORD_KEY);
  await expect.poll(demo.ghostText).toBe(' request has been received.');
  await demo.waitPastDebounce();
  expect(demo.userMessages).toHaveLength(1);
});

test('the ghost shows at the end of an earlier line, and the model sees the caret there', async ({ page }) => {
  const demo = await openDemoPage(page, (draft) => ({ nextSentence: draft.includes('Sasha,‸') ? ' your request has been received.' : '' }));
  await demo.field.click();
  await page.keyboard.type('Hi Sasha');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Best regards, Daniel');
  await expect.poll(() => demo.sentDrafts().at(-1)).toBe('Hi Sasha\nBest regards, Daniel‸');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.type(',');
  await expect.poll(demo.ghostText).toBe(' your request has been received.');
  expect(demo.sentDrafts().at(-1)).toBe('Hi Sasha,‸\nBest regards, Daniel');
  await page.keyboard.press('Tab');
  await expect(demo.field).toHaveText(/^Hi Sasha, your request has been received\.\s*Best regards, Daniel$/);
});

test('no completion is asked for with text after the caret on its line', async ({ page }) => {
  const demo = await openDemoPage(page, () => ({ nextSentence: ' never shown' }));
  await demo.field.click();
  await page.keyboard.type('Hi Sasha');
  await expect.poll(() => demo.userMessages.length).toBe(1);
  await page.keyboard.press('Home');
  await page.keyboard.type('X');
  await expect.poll(() => demo.userMessages.length).toBe(2);
  expect(demo.userMessages[1]).not.toContain('Complete the draft');
  expect(demo.sentDrafts()[1]).toBe('XHi Sasha');
});
