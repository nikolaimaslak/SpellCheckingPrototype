import { expect, test } from '@playwright/test';

type FieldTextModule = typeof import('./field-text');

const FIELD_TEXT_MODULE = '/src/app/lib/field-text.ts';

const CASES: [html: string, text: string][] = [
  ['Hi', 'Hi'],
  ['Dear Sasha,<div><br></div>', 'Dear Sasha,\n'],
  ['Dear Sasha,<div><br></div><div><br></div>', 'Dear Sasha,\n\n'],
  ['Dear Sasha,<div><br></div><div>Your</div>', 'Dear Sasha,\n\nYour'],
  ['Hi<br><br>', 'Hi\n'],
  ['Hi<br>there', 'Hi\nthere'],
  ['a<br>', 'a'],
  ['<div><br></div><div>Hi</div>', '\nHi'],
  ['<div>a</div><div>b</div>', 'a\nb'],
  ['مرحبا<div>سارة</div>', 'مرحبا\nسارة'],
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const [html, text] of CASES) {
  test(`reads ${JSON.stringify(html)} as ${JSON.stringify(text)}`, async ({ page }) => {
    const read = await page.evaluate(
      async ({ fieldHtml, modulePath }) => {
        const { readFieldText }: FieldTextModule = await import(modulePath);
        const field = document.createElement('div');
        field.innerHTML = fieldHtml;
        document.body.append(field);
        return readFieldText(field).text;
      },
      { fieldHtml: html, modulePath: FIELD_TEXT_MODULE },
    );
    expect(read).toBe(text);
  });
}

test('the caret on an empty line is at the start of that line', async ({ page }) => {
  const offsets = await page.evaluate(async (modulePath) => {
    const { caretOffset, readFieldText }: FieldTextModule = await import(modulePath);
    const field = document.createElement('div');
    field.contentEditable = 'true';
    field.innerHTML = 'Dear Sasha,<div><br></div><div><br></div><div>Daniel</div>';
    document.body.append(field);
    return [1, 2].map((line) => {
      document.getSelection()!.collapse(field.childNodes[line], 0);
      return caretOffset(readFieldText(field));
    });
  }, FIELD_TEXT_MODULE);
  expect(offsets).toEqual([12, 13]);
});
