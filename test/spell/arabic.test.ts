import { describe, expect, it } from 'vitest';
import { stripMarks } from '../../src/spell/arabic';

describe('stripMarks', () => {
  it('removes tashkeel', () => {
    expect(stripMarks('مَرْحَبًا')).toBe('مرحبا');
  });

  it('removes tatweel', () => {
    expect(stripMarks('مرحـــبا')).toBe('مرحبا');
  });

  it('leaves hamza and alef variants untouched', () => {
    for (const w of ['أسرة', 'إذا', 'آمل', 'مسؤول', 'شيء', 'اذا']) expect(stripMarks(w)).toBe(w);
  });

  it('leaves Latin text untouched', () => {
    expect(stripMarks('receive')).toBe('receive');
  });
});
