import { describe, expect, it } from 'vitest';
import { AlignmentError, outcomesFor, rankedCorrections } from '../../eval/outcomes';
import type { PipelineResult, TokenResult } from '../../eval/pipeline';
import type { Message } from '../../eval/types';

/** A pipeline token for `word` at its first occurrence in `text`. */
function tok(text: string, word: string, over: Partial<TokenResult> = {}): TokenResult {
  const start = text.indexOf(word);
  const lang = /\p{Script=Arabic}/u.test(word) ? 'ar' : 'en';
  return { word, lang, start, end: start + word.length, flagged: false, suggestions: [], replacement: null, replacementSource: null, checkMs: 0, suggestMs: null, decideMs: null, ...over };
}

const result = (tokens: TokenResult[], transient: PipelineResult['transient'] = []): PipelineResult => ({ tokens, transient });
const one = (m: Message, r: PipelineResult) => outcomesFor('test', m, r);

describe('word outcomes', () => {
  it('gold correct: untouched, false flag, corruption', () => {
    const text = 'Your Absher request';
    const out = one(
      { id: '1', text },
      result([tok(text, 'Your'), tok(text, 'Absher', { flagged: true, replacement: 'Usher' }), tok(text, 'request', { flagged: true })]),
    );
    expect(out.map((o) => [o.word, o.outcome])).toEqual([
      ['Your', 'untouched'],
      ['Absher', 'corruption'],
      ['request', 'false-flag'],
    ]);
    expect(out[1].correctionType).toBe('multi');
  });

  it('ranks the intended word for a flagged misspelling', () => {
    const text = 'I will recieve it';
    const [, , o] = one(
      { id: '1', text, labels: [{ start: 7, word: 'recieve', gold: 'misspelled', intended: 'receive' }] },
      result([tok(text, 'I'), tok(text, 'will'), tok(text, 'recieve', { flagged: true, suggestions: ['receive', 'relieve'] }), tok(text, 'it')]),
    );
    expect(o).toMatchObject({ outcome: 'flagged', rank: 1, errorType: 'transpose', correctionType: 'transpose' });
  });

  it('fixed, wrong fix and missed', () => {
    const text = 'اذا التامينات النضام';
    const labels = [
      { start: 0, word: 'اذا', gold: 'misspelled' as const, intended: 'إذا' },
      { start: 4, word: 'التامينات', gold: 'misspelled' as const, intended: 'التأمينات' },
      { start: 14, word: 'النضام', gold: 'misspelled' as const, intended: 'النظام' },
    ];
    const out = one(
      { id: '1', text, labels },
      result([
        tok(text, 'اذا', { flagged: true, suggestions: ['إذا'], replacement: 'إذا' }),
        tok(text, 'التامينات', { flagged: true, suggestions: ['التضمينات', 'التأمينات'], replacement: 'التضمينات' }),
        tok(text, 'النضام'),
      ]),
    );
    expect(out.map((o) => [o.outcome, o.rank, o.errorType])).toEqual([
      ['fixed', 1, 'hamza'],
      ['wrong-fix', 2, 'hamza'],
      ['missed', null, 'emphatic'],
    ]);
  });

  it('keeps hamza significant but ignores diacritics', () => {
    const text = 'اذا';
    const label = [{ start: 0, word: 'اذا', gold: 'misspelled' as const, intended: 'إذا' }];
    const wrong = one({ id: '1', text, labels: label }, result([tok(text, 'اذا', { flagged: true, suggestions: ['أذا'], replacement: 'أذا' })]));
    expect(wrong[0].outcome).toBe('wrong-fix');
    const vowelled = one({ id: '1', text, labels: label }, result([tok(text, 'اذا', { flagged: true, suggestions: ['إذَا'], replacement: 'إذَا' })]));
    expect(vowelled[0].outcome).toBe('fixed');
  });

  it('excluded spans: skipped, checked or changed while typing', () => {
    const text = 'case CS-104233 and ١٢٣٤٥ mail info@gosi.gov.sa';
    const labels = [
      { start: 5, word: 'CS-104233', gold: 'excluded' as const },
      { start: 19, word: '١٢٣٤٥', gold: 'excluded' as const },
      { start: 30, word: 'info@gosi.gov.sa', gold: 'excluded' as const },
    ];
    const out = one(
      { id: '1', text, labels },
      result([tok(text, 'case'), tok(text, 'CS'), tok(text, 'and'), tok(text, 'mail')], [
        { word: 'gosi', lang: 'en', start: 35, end: 39, replacement: 'gosh', replacementSource: 'neighbor' },
      ]),
    );
    expect(out.filter((o) => o.gold === 'excluded').map((o) => [o.word, o.outcome])).toEqual([
      ['CS-104233', 'exclusion-leak'],
      ['١٢٣٤٥', 'excluded'],
      ['info@gosi.gov.sa', 'exclusion-leak'],
    ]);
    expect(out.filter((o) => o.gold === 'correct').map((o) => o.word)).toEqual(['case', 'and', 'mail']);
  });

  it('counts a replacement while typing outside any excluded span as a corruption', () => {
    const text = 'see gosi.gov.sa now';
    const out = one({ id: '1', text }, result([tok(text, 'see'), tok(text, 'now')], [{ word: 'gosi', lang: 'en', start: 4, end: 8, replacement: 'gosh', replacementSource: 'neighbor' }]));
    expect(out.find((o) => o.word === 'gosi')).toMatchObject({ outcome: 'corruption', gold: 'correct' });
  });

  it('fails, naming the message, when a label does not align', () => {
    const text = 'please seperate them';
    const r = result([tok(text, 'please'), tok(text, 'seperate', { flagged: true }), tok(text, 'them')]);
    expect(() => one({ id: 'm7', text, labels: [{ start: 8, word: 'eperate', gold: 'misspelled', intended: 'eparate' }] }, r)).toThrow(
      /test message m7: label "eperate" at 8 matches no word/,
    );
    expect(() => one({ id: 'm8', text, labels: [{ start: 0, word: 'plaese', gold: 'misspelled', intended: 'please' }] }, r)).toThrow(AlignmentError);
  });

  it('builds ranked corrections with the replacement first, without duplicates', () => {
    expect(rankedCorrections({ replacement: 'separate', suggestions: ['desperate', 'separate'] })).toEqual(['separate', 'desperate']);
    expect(rankedCorrections({ replacement: null, suggestions: [] })).toEqual([]);
  });
});
