import { describe, expect, it } from 'vitest';
import { judge, loadCriteria, parseCriteria, type Criterion, type RunSummary } from '../../eval/criteria';
import { computeMetrics } from '../../eval/metrics';
import type { WordOutcome } from '../../eval/types';

const outcome = (o: Partial<WordOutcome>): WordOutcome => ({
  dataset: 'd',
  messageId: '1',
  lang: 'ar',
  word: 'w',
  start: 0,
  gold: 'misspelled',
  intended: 'x',
  outcome: 'flagged',
  errorType: 'hamza',
  rank: 1,
  replacement: null,
  source: null,
  corrections: [],
  correctionType: null,
  context: '',
  ...o,
});

/** Arabic detection recall of 74%: 74 detected, 26 missed. */
const run: RunSummary = {
  scopes: {
    clean: {},
    misspelled: {
      ar: computeMetrics([
        ...Array.from({ length: 74 }, () => outcome({})),
        ...Array.from({ length: 26 }, () => outcome({ outcome: 'missed', rank: null })),
      ]),
    },
    all: {},
  },
  instability: { ar: 0 },
  latency: {},
};

const recall = (threshold: number): Criterion => ({
  id: 'detection-recall-ar',
  label: 'Detection recall',
  metric: 'detectionRecall',
  scope: 'misspelled',
  lang: 'ar',
  threshold,
  direction: 'min',
  tolerance: 0.01,
});

describe('acceptance criteria', () => {
  it('loads the committed provisional criteria', () => {
    const criteria = loadCriteria();
    expect(criteria.find((c) => c.id === 'corruption-ar')).toMatchObject({ threshold: 1, direction: 'max', gate: true });
    expect(criteria.find((c) => c.id === 'detection-recall-ar')?.threshold).toBe(0.8);
  });

  it('marks a failing criterion and shows the value against the threshold (spec: Criterion fails)', () => {
    const [v] = judge([recall(0.8)], run);
    expect(v).toMatchObject({ value: 0.74, pass: false });
    expect(v.criterion.threshold).toBe(0.8);
  });

  it('a changed threshold changes only the verdict (spec: Thresholds changed)', () => {
    const [before] = judge([recall(0.8)], run);
    const [after] = judge([recall(0.7)], run);
    expect(after.value).toBe(before.value);
    expect(after.pass).toBe(true);
  });

  it('reports a criterion with nothing measured as not applicable', () => {
    expect(judge([{ ...recall(0.8), lang: 'en' }], run)[0].pass).toBeNull();
  });

  it('rejects malformed criteria', () => {
    expect(() => parseCriteria('{"criteria":[{"id":"x","metric":"speed","scope":"all","lang":"en","threshold":1,"direction":"min","tolerance":0}]}')).toThrow(
      /unknown metric "speed"/,
    );
    expect(() => parseCriteria('{}')).toThrow(/criteria/);
  });
});
