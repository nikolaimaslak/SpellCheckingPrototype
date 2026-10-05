import { describe, expect, it } from 'vitest';
import { alefForms, checkEntry, parseList } from '../../src/autocorrect/list-checks';

const dictionary = (...words: string[]) => {
  const set = new Set(words);
  return (w: string) => set.has(w);
};

describe('parseList', () => {
  it('reads typo<TAB>fix lines and skips comments and blanks', () => {
    expect(parseList('# source: test\n\nteh\tthe\nadn\tand\n').entries).toEqual([
      { typo: 'teh', fix: 'the' },
      { typo: 'adn', fix: 'and' },
    ]);
  });

  it('reads the acknowledgement column', () => {
    expect(parseList('اذا\tإذا\tnot: أذا أذأ').entries).toEqual([{ typo: 'اذا', fix: 'إذا', notPlausible: ['أذا', 'أذأ'] }]);
  });

  it('reports duplicates and malformed lines', () => {
    const r = parseList('teh\tthe\nteh\tthe\nbroken line\nx\t\nadn\tand\tsomething');
    expect(r.duplicates).toEqual(['teh']);
    expect(r.malformed).toEqual(['broken line', 'x', 'adn\tand\tsomething']);
  });
});

describe('alefForms', () => {
  it('swaps every alef form, without the word itself', () => {
    expect(alefForms('ان').sort()).toEqual(['آن', 'أن', 'إن'].sort());
    expect(alefForms('اذا')).toHaveLength(15);
    expect(alefForms('في')).toEqual([]);
  });
});

describe('checkEntry', () => {
  const en = dictionary('the', 'to', 'and');
  it('passes a valid entry', () => {
    expect(checkEntry({ typo: 'teh', fix: 'the' }, 'en', en)).toEqual([]);
  });

  it('names every failed check', () => {
    expect(checkEntry({ typo: 'ot', fix: 'to' }, 'en', en)).toEqual(['fewer than 3 letters']);
    expect(checkEntry({ typo: 'and', fix: 'the' }, 'en', en)).toEqual(['typo is accepted by the dictionary']);
    expect(checkEntry({ typo: 'teh', fix: 'thee' }, 'en', en)).toEqual(['fix is rejected by the dictionary']);
    expect(checkEntry({ typo: 'teh', fix: 'the' }, 'en', en, new Set(['teh']))).toEqual(['custom dictionary word']);
    expect(checkEntry({ typo: 'a lot', fix: 'the' }, 'en', en)).toContain('not a single word');
    expect(checkEntry({ typo: 'تeh', fix: 'the' }, 'en', en)).toContain('not en script');
  });

  it('rejects an Arabic entry when another alef form is an unacknowledged word', () => {
    const ar = dictionary('أن', 'إن', 'إذا', 'أذا');
    expect(checkEntry({ typo: 'ان', fix: 'أن' }, 'ar', ar)).toEqual(['other alef forms are words: إن']);
    expect(checkEntry({ typo: 'اذا', fix: 'إذا' }, 'ar', ar)).toEqual(['other alef forms are words: أذا']);
    expect(checkEntry({ typo: 'اذا', fix: 'إذا', notPlausible: ['أذا'] }, 'ar', ar)).toEqual([]);
  });

  it('rejects stale acknowledgements, and acknowledgements outside Arabic', () => {
    const ar = dictionary('إذا');
    expect(checkEntry({ typo: 'اذا', fix: 'إذا', notPlausible: ['أذا'] }, 'ar', ar)).toEqual(['stale acknowledgement: أذا']);
    expect(checkEntry({ typo: 'teh', fix: 'the', notPlausible: ['tee'] }, 'en', en)).toEqual(['acknowledgements only apply to Arabic']);
  });
});
