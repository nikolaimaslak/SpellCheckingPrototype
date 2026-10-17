import { expect, test } from '@playwright/test';
import { directionOfLastWord } from './words';

test('text direction follows the letters', () => {
  expect(directionOfLastWord('Hello سارة')).toBe('rtl');
  expect(directionOfLastWord('مرحبا Sasha')).toBe('ltr');
});
