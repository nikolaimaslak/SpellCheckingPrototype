import { describe, expect, it } from 'vitest';
import { byErrorType, bySource, computeMetrics, correctionTypes, matrixRows, percentile, upper95 } from '../../eval/metrics';
import type { Outcome, WordOutcome } from '../../eval/types';

const make = (n: number, o: Partial<WordOutcome> & { outcome: Outcome }): WordOutcome[] =>
  Array.from({ length: n }, (_, i) => ({
    dataset: 'd',
    messageId: String(i),
    lang: 'en',
    word: 'w',
    start: 0,
    gold: 'correct',
    intended: null,
    errorType: null,
    realWord: null,
    rank: null,
    replacement: null,
    source: null,
    corrections: [],
    correctionType: null,
    context: '',
    ...o,
  }));

const miss = (n: number, outcome: Outcome, rank: number | null, extra: Partial<WordOutcome> = {}) =>
  make(n, { outcome, rank, gold: 'misspelled', intended: 'x', errorType: 'transpose', ...extra });

describe('metrics', () => {
  it('computes the three layers (spec: Rates computed)', () => {
    const outcomes = [
      ...make(9978, { outcome: 'untouched' }),
      ...make(20, { outcome: 'false-flag' }),
      ...make(2, { outcome: 'corruption' }),
      // 100 misspellings: 5 missed; 95 detected, of which 40 fixed, 1 wrong fix, 54 flagged.
      // Rank 1: 40 fixed + 40 flagged = 80. Top 5: those + 10 more flagged = 90.
      ...miss(5, 'missed', null),
      ...miss(40, 'fixed', 1),
      ...miss(1, 'wrong-fix', null),
      ...miss(40, 'flagged', 1),
      ...miss(10, 'flagged', 3),
      ...miss(4, 'flagged', null),
    ];
    const m = computeMetrics(outcomes);
    expect(m.detectionRecall).toBeCloseTo(0.95);
    expect(m.falseFlagRate).toBeCloseTo(0.0022);
    expect(m.correctionAt1).toBeCloseTo(0.8);
    expect(m.correctionAt5).toBeCloseTo(0.9);
    expect(m.autoReplacePrecision).toBeCloseTo(40 / 43);
    expect(m.autoReplaceCoverage).toBeCloseTo(0.4);
    expect(m.corruptionPer10k).toBeCloseTo(2);
    expect(m.corruptionUpper95Per10k!).toBeGreaterThan(2);
  });

  it('uses the rule of three for zero corruptions', () => {
    expect(upper95(0, 5000)).toBeCloseTo(3 / 5000);
    expect(computeMetrics(make(5000, { outcome: 'untouched' })).corruptionUpper95Per10k).toBeCloseTo(6);
  });

  it('returns null rates for empty denominators', () => {
    const m = computeMetrics(make(10, { outcome: 'untouched' }));
    expect(m.detectionRecall).toBeNull();
    expect(m.autoReplacePrecision).toBeNull();
  });

  it('breaks misspellings down by error type, classifying unlabelled ones (spec: Type breakdown)', () => {
    const outcomes = [...miss(3, 'fixed', 1, { errorType: 'hamza' }), ...miss(1, 'missed', null, { errorType: 'dots' })];
    const types = byErrorType(outcomes);
    expect(types.get('hamza')!.autoReplaceCoverage).toBe(1);
    expect(types.get('dots')!.detectionRecall).toBe(0);
  });

  it('builds matrix rows without one weak type affecting another', () => {
    const outcomes = [...miss(10, 'fixed', 1, { errorType: 'hamza' }), ...miss(10, 'flagged', 2, { errorType: 'dots' })];
    const rows = matrixRows(['hamza', 'dots', 'emphatic'], outcomes, { inserted: { hamza: 10, dots: 10 }, realWord: { dots: 4 }, notApplicable: { emphatic: 7 } });
    expect(rows).toEqual([
      { type: 'hamza', generated: 10, realWordDiscards: 0, notApplicable: 0, detectionRecall: 1, correctionAt1: 1, correctionAt5: 1, autoReplaceCoverage: 1, wrongFixes: 0 },
      { type: 'dots', generated: 10, realWordDiscards: 4, notApplicable: 0, detectionRecall: 1, correctionAt1: 0, correctionAt5: 1, autoReplaceCoverage: 0, wrongFixes: 0 },
      { type: 'emphatic', generated: 0, realWordDiscards: 0, notApplicable: 7, detectionRecall: null, correctionAt1: null, correctionAt5: null, autoReplaceCoverage: null, wrongFixes: 0 },
    ]);
  });

  it('tables error type against correction type (spec: Off-diagonal correction, Corruption type)', () => {
    const outcomes = [
      ...miss(2, 'fixed', 1, { errorType: 'dots', correctionType: 'dots' }),
      ...miss(1, 'wrong-fix', null, { errorType: 'dots', correctionType: 'hamza' }),
      ...make(1, { outcome: 'corruption', correctionType: 'substitute' }),
    ];
    const t = correctionTypes(outcomes);
    expect(t.table.dots).toEqual({ dots: 2, hamza: 1 });
    expect(t.onTarget.dots).toBe(2);
    expect(t.wrongFixes).toEqual({ hamza: 1 });
    expect(t.corruptions).toEqual({ substitute: 1 });
    expect(t.distribution).toEqual({ dots: 2, hamza: 1, substitute: 1 });
  });

  it('computes nearest-rank percentiles', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('bySource', () => {
  it('breaks auto-replace down by rule (spec: Breakdown by source)', () => {
    const fixed = (source: 'list' | 'neighbor', n: number) => make(n, { outcome: 'fixed', gold: 'misspelled', source });
    const outcomes = [
      ...fixed('list', 30),
      ...fixed('neighbor', 20),
      ...make(1, { outcome: 'wrong-fix', gold: 'misspelled', source: 'neighbor' }),
      ...make(2, { outcome: 'corruption', gold: 'correct', source: 'list' }),
      ...make(49, { outcome: 'flagged', gold: 'misspelled' }),
    ];
    const s = bySource(outcomes);
    expect(s.list).toMatchObject({ fixed: 30, corruption: 2, autoReplacePrecision: 30 / 32, autoReplaceCoverage: 0.3 });
    expect(s.neighbor).toMatchObject({ fixed: 20, wrongFix: 1, autoReplacePrecision: 20 / 21, autoReplaceCoverage: 0.2 });
    expect(s.case).toMatchObject({ fixed: 0, autoReplacePrecision: null });
  });
});

describe('real-word misspellings and unscored words', () => {
  it('reports non-word and real-word recall beside overall recall (spec: Real-word recall)', () => {
    const outcomes = [
      ...miss(80, 'flagged', 1, { lang: 'ar', realWord: false }),
      ...miss(18, 'missed', null, { lang: 'ar', realWord: true }),
      ...miss(2, 'fixed', 1, { lang: 'ar', realWord: true, source: 'list' }),
    ];
    const m = computeMetrics(outcomes);
    expect(m.detectionRecall).toBeCloseTo(0.82);
    expect(m.nonWordDetectionRecall).toBe(1);
    expect(m.realWordDetectionRecall).toBeCloseTo(0.1);
    expect([m.counts.nonWord, m.counts.realWord]).toEqual([80, 20]);
  });

  it('counts English unscored words without changing any rate (spec: English unscored tokens)', () => {
    const base = [...make(990, { outcome: 'untouched' }), ...make(10, { outcome: 'false-flag' }), ...miss(10, 'flagged', 1), ...miss(2, 'fixed', 1)];
    const unscored = [
      ...make(44, { outcome: 'unscored', gold: 'unscored' }),
      ...make(5, { outcome: 'unscored', gold: 'unscored', corrections: ['went'] }),
      ...make(1, { outcome: 'unscored', gold: 'unscored', corrections: ['went'], replacement: 'went', source: 'neighbor' }),
    ];
    const without = computeMetrics(base);
    const withUnscored = computeMetrics([...base, ...unscored]);
    expect([withUnscored.counts.unscored, withUnscored.counts.unscoredFlagged, withUnscored.counts.unscoredReplaced]).toEqual([50, 5, 1]);
    for (const k of ['falseFlagRate', 'detectionPrecision', 'corruptionPer10k', 'detectionRecall', 'autoReplacePrecision'] as const) expect(withUnscored[k]).toBe(without[k]);
  });

  it('treats outcomes without the flag (committed data) as non-words', () => {
    const m = computeMetrics(miss(10, 'flagged', 1));
    expect([m.counts.nonWord, m.counts.realWord, m.realWordDetectionRecall]).toEqual([10, 0, null]);
  });
});
