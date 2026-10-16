import { expect, test } from '@playwright/test';
import { openDemoPage } from './demo-page';

test.skip(true, 'the Fix spelling button is hidden');

test.beforeEach(async ({ page }) => {
  const demo = await openDemoPage(page, () => ({ mistakes: [{ word: 'teh', context: 'send teh form', fixes: ['the'], sure: false }] }));
  await page.getByRole('checkbox', { name: 'Auto-correct' }).uncheck();
  await demo.field.click();
  await page.keyboard.type('I will send teh form');
  await page.getByRole('button', { name: 'Fix spelling' }).click();
  await expect(page.getByRole('dialog', { name: 'Spelling fixes' })).toBeVisible();
});

test('Accept replaces the text', async ({ page }) => {
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('textbox', { name: 'Agent message' })).toHaveText('I will send the form');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Dismiss and Escape keep the text', async ({ page }) => {
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fix spelling' }).click();
  await expect(page.getByRole('dialog', { name: 'Spelling fixes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Agent message' })).toHaveText('I will send teh form');
});
