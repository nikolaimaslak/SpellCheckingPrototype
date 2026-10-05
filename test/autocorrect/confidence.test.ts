import { describe, expect, it } from 'vitest';
import { caseFolded, decide as decideWithSource, type AutoReplaceConfidence } from '../../src/autocorrect/confidence';
import type { Lang } from '../../src/spell/protocol';

const ctx = (ignored: string[] = [], custom: string[] = [], confidence?: AutoReplaceConfidence) => ({
  ignored: new Set(ignored),
  customWords: new Set(custom),
  confidence,
});
const n = (...neighbors: string[]) => ({ neighbors, caseFix: null });
/** The replacement only, as most cases need. */
const decide = (...args: Parameters<typeof decideWithSource>) => decideWithSource(...args)?.fix ?? null;

describe('decide: known misspellings', () => {
  it('fixes a listed word whatever its length or neighbors, keeping a leading capital', () => {
    expect(decide('teh', 'en', n('the', 'tea', 'ten'), ctx())).toBe('the');
    expect(decide('Teh', 'en', n(), ctx())).toBe('The');
    expect(decide('TEH', 'en', n(), ctx())).toBeNull();
  });

  it('fixes listed Arabic hamza slips, but not an ambiguous word', () => {
    expect(decide('اذا', 'ar', n('إذا', 'ذا', 'هذا'), ctx())).toBe('إذا');
    expect(decide('الى', 'ar', n(), ctx())).toBe('إلى');
    expect(decide('ان', 'ar', n('أن', 'إن'), ctx())).toBeNull();
  });

  it('respects the ignore list and the custom dictionary', () => {
    expect(decide('teh', 'en', n(), ctx(['en:teh']))).toBeNull();
    expect(decide('teh', 'en', n(), ctx([], ['teh']))).toBeNull();
  });

  it('at list-only confidence fixes only listed words', () => {
    const only = ctx([], [], 'list');
    expect(decide('teh', 'en', n(), only)).toBe('the');
    expect(decide('paymnet', 'en', n('payment'), only)).toBeNull();
    expect(decide('المستخذم', 'ar', n('المستخدم'), only)).toBeNull();
    expect(decide('oNly', 'en', { neighbors: [], caseFix: 'only' }, only)).toBeNull();
  });

  it('reports the rule that produced each fix', () => {
    const src = (w: string, l: Lang, e: { neighbors: string[]; caseFix: string | null }) => decideWithSource(w, l, e, ctx())?.source;
    expect(src('teh', 'en', n())).toBe('list');
    expect(src('oNly', 'en', { neighbors: ['oily'], caseFix: 'only' })).toBe('case');
    expect(src('paymnet', 'en', n('payment'))).toBe('neighbor');
  });
});

describe('decide', () => {
  it('fixes a clear English slip', () => {
    expect(decide('seperate', 'en', n('separate'), ctx())).toBe('separate');
  });

  it('leaves a word with two dictionary neighbors as a suggestion', () => {
    expect(decide('afte', 'en', n('after', 'aft', 'ate', 'fate', 'ante'), ctx())).toBeNull();
  });

  it('fixes a clear Arabic slip and a doubled Arabic letter', () => {
    expect(decide('المستخذم', 'ar', n('المستخدم'), ctx())).toBe('المستخدم');
    expect(decide('حتىى', 'ar', n('حتى'), ctx())).toBe('حتى');
  });

  it('leaves Arabic words with many neighbors as suggestions', () => {
    expect(decide('النضام', 'ar', n('الضام', 'النظام', 'لنضام'), ctx())).toBeNull();
    expect(decide('ان', 'ar', n('أن', 'إن', 'آن'), ctx())).toBeNull();
  });

  it('treats the alef forms as one first letter', () => {
    expect(decide('امانة', 'ar', n('أمانة'), ctx())).toBe('أمانة');
  });

  it('enforces minimum length for the general rules: 4 for English, 3 for Arabic', () => {
    expect(decide('tge', 'en', n('the'), ctx())).toBeNull();
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
