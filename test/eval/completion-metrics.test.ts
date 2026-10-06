import { describe, expect, it } from 'vitest';
import type { CompletionCase } from '../../eval/completion/cases';
import { metricsOf, metricsTable, percentile, summarizeCase, type CaseResult, type Sample } from '../../eval/completion/metrics';

const shown = (completion: string, ms = 100, user = ''): Sample => ({ reply: { completion, edit: { typed: '', word: '', rest: completion } }, user, ms });
const format = (ms = 100): Sample => ({ reply: { completion: '', withheld: 'format' }, user: '', ms });
const failed = (): Sample => ({ reply: null, user: '', ms: 5000, error: 'timed out' });
const kase = (id: string, prefix: string, extra: Partial<CompletionCase> = {}): CompletionCase => ({ id, lang: 'en', category: 'mid-word', prefix, ...extra });

const pati: CaseResult = { case: kase('pati', 'Thank you for your pati', { seamWord: 'patience' }), samples: [shown('ence.'), shown('ence.'), shown('ent.'), format(), shown('ence!')] };
const days: CaseResult = {
  case: kase('days', 'It will take', { category: 'details', lang: 'ar' }),
  samples: [shown(' 3 days.', 200, 'It takes 3 days.'), shown(' 5 days.', 300, 'It takes 3 days.'), failed()],
};

describe('completion metrics', () => {
  it('computes rates, seam accuracy over shown samples, and inventions', () => {
    const m = metricsOf([pati, days]);
    expect(m.samples).toBe(8);
    expect(m.shownRate).toBeCloseTo(6 / 8);
    expect(m.formatRate).toBeCloseTo(1 / 8);
    expect(m.errorRate).toBeCloseTo(1 / 8);
    expect(m.seamAccuracy).toBeCloseTo(3 / 4);
    expect(m.inventionRate).toBeCloseTo(1 / 6);
    expect(m.spacingErrorRate).toBe(0);
  });

  it('lowers shown agreement for an unstable case and counts distinct completions', () => {
    const steady: CaseResult = { case: kase('steady', 'Have a wonderful weeke', { seamWord: 'weekend' }), samples: [shown('nd!'), shown('nd!')] };
    const m = metricsOf([pati, steady]);
    expect(m.shownAgreement).toBe(0.5);
    expect(m.distinctPerCase).toBe((3 + 1) / 2);
  });

  it('computes latency percentiles over answered samples only', () => {
    expect(percentile([100, 200, 300, 400], 50)).toBe(200);
    expect(percentile([100, 200, 300, 400], 95)).toBe(400);
    expect(percentile([], 50)).toBeNull();
    const m = metricsOf([days]);
    expect(m.p50Ms).toBe(200);
    expect(m.p95Ms).toBe(300);
  });

  it('splits by language column and category', () => {
    const t = metricsTable([pati, days]);
    expect(t.byColumn.en.samples).toBe(5);
    expect(t.byColumn.ar.samples).toBe(3);
    expect(t.byColumn.mixed.samples).toBe(0);
    expect(t.byColumn.mixed.shownRate).toBeNull();
    expect(t.byColumn.all.samples).toBe(8);
    expect(t.byCategory.details.samples).toBe(3);
  });

  it('summarizes a case for the report', () => {
    expect(summarizeCase(days)).toMatchObject({ shown: 2, errors: 1, distinct: 2, example: ' 3 days.', inventions: ['5'] });
    expect(summarizeCase(pati)).toMatchObject({ shown: 4, format: 1, seamChecked: 4, seamOk: 3 });
  });
});
