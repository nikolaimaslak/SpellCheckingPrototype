import { expect, test } from '@playwright/test';
import { openDemoPage } from './demo-page';

test('without a key the field, the toggles and Fix spelling are off', async ({ page }) => {
  await page.goto('/');
  const field = page.getByRole('textbox', { name: 'Agent message' });
  await expect(field).toHaveAttribute('contenteditable', 'false');
  expect(await field.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"Paste your API key above to start typing."');
  for (const name of ['Spell check', 'Auto-correct', 'Completion']) {
    await expect(page.getByRole('checkbox', { name })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: 'Fix spelling' })).toBeDisabled();
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
  await expect.poll(() => demo.userMessages.length).toBe(1);
  expect(demo.userMessages[0]).toContain('Daniel Haddad');

  await page.getByRole('button', { name: 'Arabic' }).click();
  await page.waitForTimeout(700);
  await demo.field.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' there');
  await expect.poll(() => demo.userMessages.length).toBe(2);
  expect(demo.userMessages[1]).toContain('خالد الحربي');
  await expect(demo.field).toHaveText('Hi there');
});
