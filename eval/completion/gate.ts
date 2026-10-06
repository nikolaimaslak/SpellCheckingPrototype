// The completion regression gate: compares a run with the committed baseline
// (eval/completion/baseline.json). Compared criteria fail only when worse than
// the baseline by more than their tolerance, so a known weakness doesn't
// block every run but a worsening does; threshold-only criteria (stability,
// latency) fail on their threshold.
import type { Criterion, Verdict } from './criteria.ts';

export const BASELINE_PATH = 'eval/completion/baseline.json';

export interface Baseline {
  model: string;
  datasetHash: string;
  samples: number;
  /** Criterion id → value. */
  criteria: Record<string, number | null>;
}

export interface RunInfo {
  model: string;
  datasetHash: string;
  samples: number;
  verdicts: Verdict[];
}

export interface GateResult {
  /** Set when the baseline can't be compared with this run. */
  refused?: string;
  regressions: string[];
  improvements: string[];
}

export const toBaseline = (r: RunInfo): Baseline => ({
  model: r.model,
  datasetHash: r.datasetHash,
  samples: r.samples,
  criteria: Object.fromEntries(r.verdicts.map((v) => [v.criterion.id, v.value])),
});

const fmt = (c: Criterion, v: number) => (c.metric.endsWith('Ms') ? `${Math.round(v)} ms` : v.toFixed(3));
const EPS = 1e-9;

export function gate(run: RunInfo, base: Baseline): GateResult {
  if (base.model !== run.model) return { refused: `the baseline was made with model ${base.model}, this run used ${run.model}`, regressions: [], improvements: [] };
  if (base.datasetHash !== run.datasetHash) return { refused: 'the baseline was made with a different case dataset (eval/completion/cases.jsonl changed)', regressions: [], improvements: [] };
  if (base.samples !== run.samples) return { refused: `the baseline used ${base.samples} samples per case, this run ${run.samples}`, regressions: [], improvements: [] };
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const { criterion: c, value } of run.verdicts) {
    if (value === null) continue;
    if (c.compare === false) {
      const ok = c.direction === 'min' ? value >= c.threshold : value <= c.threshold;
      if (!ok) regressions.push(`${c.id}: ${fmt(c, value)} misses the threshold ${c.direction === 'min' ? '≥' : '≤'} ${fmt(c, c.threshold)}`);
      continue;
    }
    const was = base.criteria[c.id];
    if (was === null || was === undefined) continue;
    const worse = c.direction === 'max' ? value - was : was - value;
    if (worse > c.tolerance + EPS) regressions.push(`${c.id}: ${fmt(c, was)} → ${fmt(c, value)} (tolerance ${fmt(c, c.tolerance)})`);
    else if (-worse > c.tolerance + EPS) improvements.push(`${c.id}: ${fmt(c, was)} → ${fmt(c, value)}`);
  }
  return { regressions, improvements };
}
