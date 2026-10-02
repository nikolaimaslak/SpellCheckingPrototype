import { describe, expect, it } from 'vitest';
import { osa } from '../../src/autocorrect/distance';

describe('osa', () => {
  it.each([
    ['receive', 'receive', 0],
    ['recieve', 'receive', 1], // adjacent swap
    ['paymnet', 'payment', 1], // adjacent swap
    ['untill', 'until', 1], // deletion
    ['necesary', 'necessary', 1], // insertion
    ['wierd', 'weird', 1],
    ['adress', 'dress', 1],
    ['teh', 'tech', 1],
    ['recieve', 'relieve', 1], // substitution
    ['abc', 'cab', 2],
    ['', 'abc', 3],
    ['النضام', 'النظام', 1], // Arabic substitution
    ['اذا', 'إذا', 1],
    ['الطلبب', 'الطلب', 1],
  ])('osa(%s, %s) = %i', (a, b, d) => {
    expect(osa(a, b)).toBe(d);
  });
});
