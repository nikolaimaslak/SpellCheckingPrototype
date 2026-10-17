import { expect, test } from '@playwright/test';
import { openDemoPage } from './demo-page';

test('without a key the field and the toggles are off', async ({ page }) => {
  await page.goto('/');
  const field = page.getByRole('textbox', { name: 'Agent message' });
  await expect(field).toHaveAttribute('contenteditable', 'false');
  expect(await field.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"Paste your API key above to start typing."');
  for (const name of ['Spell check', 'Auto-correction', 'Auto-completion']) {
    await expect(page.getByRole('checkbox', { name })).toBeDisabled();
  }
});

test('the placeholder shows only while the field is empty', async ({ page }) => {
  const { field } = await openDemoPage(page, () => ({}));
  const placeholder = () => field.evaluate((element) => getComputedStyle(element, '::before').content);
  expect(await placeholder()).toBe('"Type your message to the customer…"');
  await field.click();
  await page.keyboard.type('Hi');
  expect(await placeholder()).toBe('none');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  expect(await placeholder()).toBe('"Type your message to the customer…"');
});

test('a settings change reaches the next request and keeps the typed text', async ({ page }) => {
  const demo = await openDemoPage(page, () => ({}));
  await demo.field.click();
  await page.keyboard.type('Hi');
  await expect.poll(() => demo.spellCheckMessages.length).toBe(1);
  expect(demo.spellCheckMessages[0]).toContain('Daniel Haddad');

  await page.getByRole('button', { name: 'Arabic' }).click();
  await expect(page.getByLabel('Custom dictionary')).toHaveValue('أبشر\nمدد');
  await expect(page.getByLabel('Ignored words')).toHaveValue('انشالله');
  await page.waitForTimeout(700);
  await demo.field.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' there');
  await expect.poll(() => demo.spellCheckMessages.length).toBe(2);
  expect(demo.spellCheckMessages[1]).toContain('خالد الحربي');
  await expect(demo.field).toHaveText('Hi there');
});

test('clearing the field clears the request status and sends no request', async ({ page }) => {
  const demo = await openDemoPage(page, () => ({}));
  await demo.field.click();
  await page.keyboard.type('Hi');
  await expect(page.getByRole('status')).toHaveText('Waiting for you to stop typing…');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('status')).toHaveText('');
  await demo.waitPastDebounce();
  expect(demo.userMessages).toHaveLength(0);
});

test('a failed request shows in the status and in the event log with its reason', async ({ page }) => {
  const demo = await openDemoPage(page, () => ({}));
  await page.route('https://api.openai.com/**', (route) => route.fulfill({ status: 401, json: { error: { message: 'Incorrect API key provided.' } } }));
  await demo.field.click();
  await page.keyboard.type('Hi');
  await expect(page.getByRole('status')).toHaveText(/LLM request failed/);
  await page.getByText('Debugger').click();
  await expect(page.locator('pre')).toContainText('[spell-check] request failed: HTTP 401: Incorrect API key provided.');
});
