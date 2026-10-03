// Acceptance criteria: a threshold per metric and language, read from
// eval/criteria.json, and the pass/fail verdict for a run's values.
import { readFileSync } from 'node:fs';
import type { Lang } from './error-types.ts';
import type { Metrics } from './metrics.ts';

export type Scope = 'clean' | 'misspelled' | 'all';
export type RateMetric = Exclude<keyof Metrics, 'counts'>;
export type CriterionMetric = RateMetric | 'exclusionLeaks' | 'instability' | 'checkP95Ms' | 'suggestP95Ms';

export interface Criterion {
  id: string;
  label: string;
  metric: CriterionMetric;
  scope: Scope;
  lang: Lang | 'all';
  threshold: number;
  direction: 'min' | 'max';
  /** How much worse than the baseline the value may get before the gate fails. */
  tolerance: number;
  /** Part of the gate for enabling auto-replace by default. */
  gate?: boolean;
  /** false: judged against the threshold only, never compared with the baseline (values that vary with machine load). */
  compare?: boolean;
}

/** What a run measured, as the criteria read it. */
export interface RunSummary {
  scopes: Record<Scope, Partial<Record<Lang | 'all', Metrics>>>;
  instability: Partial<Record<Lang | 'all', number>>;
  latency: Partial<Record<Lang | 'all', { checkP95Ms: number | null; suggestP95Ms: number | null }>>;
}

export interface Verdict {
  criterion: Criterion;
  value: number | null;
  /** null when the run had nothing to measure for this criterion. */
  pass: boolean | null;
}

const METRICS = new Set<string>([
  'detectionRecall',
  'falseFlagRate',
  'detectionPrecision',
  'correctionAt1',
  'correctionAt5',
  'correctionAt1Detected',
  'correctionAt5Detected',
  'autoReplacePrecision',
  'autoReplaceCoverage',
  'corruptionPer10k',
  'corruptionUpper95Per10k',
  'exclusionLeaks',
  'instability',
  'checkP95Ms',
  'suggestP95Ms',
]);

export function parseCriteria(json: string): Criterion[] {
  const doc = JSON.parse(json) as { criteria?: unknown };
  if (!Array.isArray(doc.criteria)) throw new Error('criteria file: expected a "criteria" array');
  const ids = new Set<string>();
  return doc.criteria.map((c: Criterion, i: number) => {
    const where = `criteria file, entry ${i + 1} (${c.id ?? 'no id'})`;
    if (typeof c.id !== 'string' || ids.has(c.id)) throw new Error(`${where}: needs a unique "id"`);
    ids.add(c.id);
    if (!METRICS.has(c.metric)) throw new Error(`${where}: unknown metric "${c.metric}"`);
    if (!['clean', 'misspelled', 'all'].includes(c.scope)) throw new Error(`${where}: scope must be clean, misspelled or all`);
    if (!['en', 'ar', 'all'].includes(c.lang)) throw new Error(`${where}: lang must be en, ar or all`);
    if (!['min', 'max'].includes(c.direction)) throw new Error(`${where}: direction must be min or max`);
    if (typeof c.threshold !== 'number' || typeof c.tolerance !== 'number' || c.tolerance < 0) throw new Error(`${where}: needs a numeric threshold and a tolerance ≥ 0`);
    return c;
  });
}

export const loadCriteria = (path = 'eval/criteria.json') => parseCriteria(readFileSync(path, 'utf8'));

export function valueOf(c: Criterion, run: RunSummary): number | null {
  switch (c.metric) {
    case 'instability':
      return run.instability[c.lang] ?? null;
    case 'checkP95Ms':
    case 'suggestP95Ms':
      return run.latency[c.lang]?.[c.metric] ?? null;
    case 'exclusionLeaks':
      return run.scopes[c.scope][c.lang]?.counts.exclusionLeaks ?? null;
    default:
      return run.scopes[c.scope][c.lang]?.[c.metric] ?? null;
  }
}

export const passes = (c: Criterion, value: number | null): boolean | null =>
  value === null ? null : c.direction === 'min' ? value >= c.threshold : value <= c.threshold;

export const judge = (criteria: Criterion[], run: RunSummary): Verdict[] =>
  criteria.map((criterion) => {
    const value = valueOf(criterion, run);
    return { criterion, value, pass: passes(criterion, value) };
  });
