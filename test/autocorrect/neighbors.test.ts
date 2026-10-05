import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { oneEditVariants, tryAlphabet } from '../../src/autocorrect/neighbors';

describe('oneEditVariants', () => {
  it('covers every deletion, swap, substitution and insertion exactly once', () => {
    const v = oneEditVariants('abc', ['a', 'x']);
    // Letters: a, x plus the word's own b, c → 4.
    // Deletions 3, swaps 2, substitutions 3×3, insertions 4×4, minus duplicates.
    expect(new Set(v).size).toBe(v.length);
    expect(v).not.toContain('abc');
    for (const w of ['bc', 'ac', 'ab', 'bac', 'acb', 'xbc', 'axc', 'abx', 'xabc', 'aabc', 'abcx', 'abcc']) expect(v).toContain(w);
    // Inserting "a" before or after the leading "a" is the same string.
    expect(v.filter((w) => w === 'aabc')).toHaveLength(1);
    expect(v.every((w) => Math.abs(w.length - 3) <= 1)).toBe(true);
  });

  it('works in code points for Arabic', () => {
    const v = oneEditVariants('النضام', ['ظ']);
    expect(v).toContain('النظام');
    expect(v).toContain('لنضام');
    expect(v).toContain('النضامظ');
    expect(v.every((w) => Math.abs([...w].length - 6) <= 1)).toBe(true);
  });

  it('never returns the empty string', () => {
    expect(oneEditVariants('a', [])).toEqual(['aa']);
  });
});

describe('tryAlphabet', () => {
  it('reads the English TRY line in lower case, with the apostrophe', () => {
    const a = tryAlphabet(readFileSync('node_modules/dictionary-en/index.aff', 'utf8'), 'en');
    expect(a).toContain('e');
    expect(a).toContain("'");
    expect(a.some((c) => c !== c.toLowerCase())).toBe(false);
    // 23 letters (the line has no j, q or x) and the apostrophe.
    expect(a).toHaveLength(24);
  });

  it('reads the Arabic TRY line without harakat', () => {
    const a = tryAlphabet(readFileSync('dicts/ar/ar.aff', 'utf8'), 'ar');
    expect(a).toContain('ظ');
    expect(a).toContain('إ');
    expect(a.some((c) => /\p{M}/u.test(c))).toBe(false);
  });

  it('returns nothing without a TRY line', () => {
    expect(tryAlphabet('SET UTF-8\n', 'en')).toEqual([]);
  });
});
