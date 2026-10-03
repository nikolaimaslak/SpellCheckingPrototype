import { describe, expect, it } from 'vitest';
import { compileSource } from '../../eval/build-datasets';

describe('dataset sources', () => {
  it('turns markers into labels and skips comments and blank lines', () => {
    const src = '# comment\n\nHello ⟦$(user.firstName)⟧, please ⟨seperate→separate⟩ them\nرقم ⟦١٢٣٤٥⟧ في ⟨النضام→النظام⟩\n';
    expect(compileSource('t', src)).toEqual([
      {
        id: 't-3',
        text: 'Hello $(user.firstName), please seperate them',
        labels: [
          { start: 6, word: '$(user.firstName)', gold: 'excluded' },
          { start: 32, word: 'seperate', gold: 'misspelled', intended: 'separate' },
        ],
      },
      {
        id: 't-4',
        text: 'رقم ١٢٣٤٥ في النضام',
        labels: [
          { start: 4, word: '١٢٣٤٥', gold: 'excluded' },
          { start: 13, word: 'النضام', gold: 'misspelled', intended: 'النظام' },
        ],
      },
    ]);
  });

  it('omits labels for a message without markers', () => {
    expect(compileSource('t', 'Thank you.')).toEqual([{ id: 't-1', text: 'Thank you.' }]);
  });

  it('rejects an unbalanced marker', () => {
    expect(() => compileSource('t', 'see ⟦https://x')).toThrow(/t line 1: unbalanced marker/);
  });
});
