import { describe, expect, it } from 'vitest';
import { caseFolded, decide } from '../../src/autocorrect/confidence';

const ctx = (ignored: string[] = [], custom: string[] = []) => ({ ignored: new Set(ignored), customWords: new Set(custom) });
const n = (...neighbors: string[]) => ({ neighbors, caseFix: null });

describe('decide', () => {
  it('fixes a clear English slip', () => {
    expect(decide('seperate', 'en', n('separate'), ctx())).toBe('separate');
  });

  it('leaves a word with two dictionary neighbors as a suggestion', () => {
    expect(decide('recieve', 'en', n('receive', 'relieve'), ctx())).toBeNull();
  });

  it('fixes a clear Arabic slip and a doubled Arabic letter', () => {
    expect(decide('المستخذم', 'ar', n('المستخدم'), ctx())).toBe('المستخدم');
    expect(decide('حتىى', 'ar', n('حتى'), ctx())).toBe('حتى');
  });

  it('leaves Arabic words with many neighbors as suggestions', () => {
    expect(decide('النضام', 'ar', n('الضام', 'النظام', 'لنضام'), ctx())).toBeNull();
    expect(decide('اذا', 'ar', n('إذا', 'ذا', 'هذا'), ctx())).toBeNull();
    expect(decide('التامينات', 'ar', n('التأمينات', 'التضمينات', 'التثمينات'), ctx())).toBeNull();
  });

  it('treats the alef forms as one first letter', () => {
    expect(decide('اسرة', 'ar', n('أسرة'), ctx())).toBe('أسرة');
  });

  it('enforces minimum length: 4 for English, 3 for Arabic', () => {
    expect(decide('teh', 'en', n('the'), ctx())).toBeNull();
    expect(decide('اب', 'ar', n('أب'), ctx())).toBeNull();
  });

  it('never touches all-caps words', () => {
    expect(decide('GOSSI', 'en', n('gosi'), ctx())).toBeNull();
  });

  it('requires the same first letter', () => {
    expect(decide('kat', 'en', n('cat'), ctx())).toBeNull();
    expect(decide('xtation', 'en', n('station'), ctx())).toBeNull();
  });

  it('keeps a leading capital', () => {
    expect(decide('Seperate', 'en', n('separate'), ctx())).toBe('Separate');
    expect(decide('LLet', 'en', n('let'), ctx())).toBe('Let');
    expect(decide('Abshr', 'en', n('absher'), ctx())).toBe('Absher');
  });

  it('fixes only the case when that is enough, even with competing neighbors', () => {
    expect(decide('oNly', 'en', { neighbors: ['oily'], caseFix: 'only' }, ctx())).toBe('only');
    expect(decide('thiS', 'en', { neighbors: ['his', 'thin', 'thus'], caseFix: 'this' }, ctx())).toBe('this');
    expect(decide('dOcument', 'en', { neighbors: ['documents'], caseFix: 'document' }, ctx())).toBe('document');
  });

  it('skips ignored and custom words', () => {
    expect(decide('seperate', 'en', n('separate'), ctx(['en:seperate']))).toBeNull();
    expect(decide('Abshr', 'en', n('absher'), ctx([], ['Abshr']))).toBeNull();
    expect(decide('oNly', 'en', { neighbors: [], caseFix: 'only' }, ctx(['en:oNly']))).toBeNull();
  });

  it('measures Arabic length without diacritics', () => {
    expect(decide('النَّضام', 'ar', n('النظام'), ctx())).toBe('النظام');
  });
});

describe('caseFolded', () => {
  it('lowercases all but the first letter', () => {
    expect(caseFolded('oNly', 'en')).toBe('only');
    expect(caseFolded('ThiS', 'en')).toBe('This');
    expect(caseFolded('dOcument', 'en')).toBe('document');
  });

  it('is null when nothing would change, and for Arabic', () => {
    expect(caseFolded('only', 'en')).toBeNull();
    expect(caseFolded('Only', 'en')).toBeNull();
    expect(caseFolded('النظام', 'ar')).toBeNull();
  });
});
