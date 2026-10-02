import { describe, expect, it } from 'vitest';
import { decide } from '../../src/autocorrect/confidence';

const ctx = (ignored: string[] = [], custom: string[] = []) => ({ ignored: new Set(ignored), customWords: new Set(custom) });

describe('decide', () => {
  it('fixes a clear English slip', () => {
    expect(decide('seperate', 'en', ['separate', 'desperate'], ctx())).toBe('separate');
  });

  it('leaves ambiguous slips as suggestions', () => {
    expect(decide('recieve', 'en', ['receive', 'relieve', 'reverie'], ctx())).toBeNull();
  });

  it('fixes a clear Arabic slip', () => {
    expect(decide('النضام', 'ar', ['النظام'], ctx())).toBe('النظام');
  });

  it('fixes a missing hamza on a short Arabic word via the alef class', () => {
    expect(decide('اذا', 'ar', ['إذا'], ctx())).toBe('إذا');
  });

  it('leaves ambiguous Arabic slips', () => {
    expect(decide('التامينات', 'ar', ['التأمينات', 'التضمينات', 'التثمينات'], ctx())).toBeNull();
  });

  it('enforces minimum length: 4 for English, 3 for Arabic', () => {
    expect(decide('teh', 'en', ['the'], ctx())).toBeNull();
    expect(decide('ab', 'ar', [], ctx())).toBeNull();
  });

  it('never touches all-caps words', () => {
    expect(decide('GOSSI', 'en', ['GOSI'], ctx())).toBeNull();
  });

  it('requires the same first letter', () => {
    expect(decide('adress', 'en', ['dress'], ctx())).toBeNull(); // "address" is the intended word but two candidates exist anyway
    expect(decide('kat', 'en', ['cat'], ctx())).toBeNull();
    expect(decide('xtation', 'en', ['station'], ctx())).toBeNull();
  });

  it('preserves capitalization', () => {
    expect(decide('Seperate', 'en', ['separate'], ctx())).toBe('Separate');
  });

  it('ignores hyphenated and multi-word suggestions the word did not have', () => {
    expect(decide('occured', 'en', ['occurred', 'occur-ed'], ctx())).toBe('occurred');
    expect(decide('calender', 'en', ['calendar', 'ca lender'], ctx())).toBe('calendar');
  });

  it('ignores suggestions in another script', () => {
    expect(decide('paymnet', 'en', ['payment', 'بايمنت'], ctx())).toBe('payment');
  });

  it('skips ignored and custom words', () => {
    expect(decide('seperate', 'en', ['separate'], ctx(['en:seperate']))).toBeNull();
    expect(decide('Abshr', 'en', ['Absher'], ctx([], ['Abshr']))).toBeNull();
  });

  it('measures Arabic distance without diacritics', () => {
    expect(decide('النَّضام', 'ar', ['النظام'], ctx())).toBe('النظام');
  });
});
