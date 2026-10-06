import { describe, expect, it } from 'vitest';
import { loadCriteria, parseCriteria, type Criterion, type Verdict } from '../../eval/completion/criteria';
import { gate, toBaseline, type RunInfo } from '../../eval/completion/gate';

const crit = (over: Partial<Criterion>): Criterion => ({ id: 'seam', label: 'x', metric: 'seamAccuracy', column: 'all', category: 'all', threshold: 0.9, direction: 'min', tolerance: 0.05, ...over });
const run = (verdicts: [Criterion, number | null][], over: Partial<RunInfo> = {}): RunInfo => ({
  model: 'm',
  datasetHash: 'h',
  samples: 5,
  verdicts: verdicts.map(([criterion, value]): Verdict => ({ criterion, value, pass: null })),
  ...over,
});

describe('completion gate', () => {
  const seam = crit({});
  const format = crit({ id: 'format', metric: 'formatRate', threshold: 0.15, direction: 'max', tolerance: 0.06 });
  const latency = crit({ id: 'p95', metric: 'p95Ms', threshold: 1500, direction: 'max', tolerance: 0, compare: false });
  const base = toBaseline(run([[seam, 0.95], [format, 0.3], [latency, 900]]));

  it('passes a change within tolerance, even below a compared threshold', () => {
    expect(gate(run([[seam, 0.91], [format, 0.35], [latency, 1000]]), base)).toEqual({ regressions: [], improvements: [] });
  });

  it('names a regression beyond tolerance with both values', () => {
    expect(gate(run([[seam, 0.85], [format, 0.3], [latency, 900]]), base).regressions).toEqual(['seam: 0.950 → 0.850 (tolerance 0.050)']);
    expect(gate(run([[seam, 0.95], [format, 0.4], [latency, 900]]), base).regressions).toEqual(['format: 0.300 → 0.400 (tolerance 0.060)']);
  });

  it('reports improvements without failing', () => {
    expect(gate(run([[seam, 0.95], [format, 0.1], [latency, 900]]), base)).toEqual({ regressions: [], improvements: ['format: 0.300 → 0.100'] });
  });

  it('fails a threshold-only criterion on its threshold, whatever the baseline', () => {
    expect(gate(run([[seam, 0.95], [format, 0.3], [latency, 1800]]), base).regressions).toEqual(['p95: 1800 ms misses the threshold ≤ 1500 ms']);
  });

  it('refuses a baseline made with another model, dataset or sample count', () => {
    expect(gate(run([[seam, 0.95]], { model: 'other' }), base).refused).toMatch(/model m, this run used other/);
    expect(gate(run([[seam, 0.95]], { datasetHash: 'x' }), base).refused).toMatch(/different case dataset/);
    expect(gate(run([[seam, 0.95]], { samples: 3 }), base).refused).toMatch(/5 samples per case, this run 3/);
  });
});

describe('completion criteria', () => {
  it('loads the committed file', () => {
    expect(loadCriteria().map((c) => c.id)).toContain('seam-accuracy');
  });

  it('rejects an unknown metric or a category read in a language column', () => {
    expect(() => parseCriteria(JSON.stringify({ criteria: [crit({ metric: 'nope' as never })] }))).toThrow('unknown metric');
    expect(() => parseCriteria(JSON.stringify({ criteria: [crit({ category: 'details', column: 'ar' })] }))).toThrow('reads column "all"');
  });
});
