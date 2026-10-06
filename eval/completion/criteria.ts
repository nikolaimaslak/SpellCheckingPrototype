// Completion criteria (eval/completion/criteria.json) and their verdicts.
import { readFileSync } from 'node:fs';
import { CATEGORIES, type Category } from './cases.ts';
import { COLUMNS, type Column, type Metrics, type MetricsTable } from './metrics.ts';

export type CriterionMetric = Exclude<keyof Metrics, 'cases' | 'samples'>;

export interface Criterion {
  id: string;
  label: string;
  metric: CriterionMetric;
  column: Column;
  /** A category, or 'all'; a category is read across all languages (column must be 'all'). */
  category: Category | 'all';
  threshold: number;
  direction: 'min' | 'max';
  /** How much worse than the baseline a compared value may get. */
  tolerance: number;
  /** false: judged against the threshold only (stability, latency). */
  compare?: boolean;
}

export interface Verdict {
  criterion: Criterion;
  value: number | null;
  /** Threshold verdict; null when there was nothing to measure. */
  pass: boolean | null;
}

export const CRITERIA_PATH = 'eval/completion/criteria.json';
const METRICS: CriterionMetric[] = ['shownRate', 'formatRate', 'errorRate', 'seamAccuracy', 'spacingErrorRate', 'inventionRate', 'shownAgreement', 'distinctPerCase', 'p50Ms', 'p95Ms'];

export function parseCriteria(json: string): Criterion[] {
  const list = (JSON.parse(json) as { criteria?: unknown }).criteria;
  if (!Array.isArray(list)) throw new Error('criteria.json: "criteria" must be a list');
  const ids = new Set<string>();
  return list.map((c: Criterion, i) => {
    const where = `criteria.json: criterion ${i + 1}`;
    if (!c.id || ids.has(c.id)) throw new Error(`${where}: missing or duplicate id`);
    ids.add(c.id);
    if (!METRICS.includes(c.metric)) throw new Error(`${where}: unknown metric "${c.metric}"`);
    if (!COLUMNS.includes(c.column)) throw new Error(`${where}: unknown column "${c.column}"`);
    if (c.category !== 'all' && !(CATEGORIES as readonly string[]).includes(c.category)) throw new Error(`${where}: unknown category "${c.category}"`);
    if (c.category !== 'all' && c.column !== 'all') throw new Error(`${where}: a category criterion reads column "all"`);
    if (c.direction !== 'min' && c.direction !== 'max') throw new Error(`${where}: direction must be min or max`);
    if (typeof c.threshold !== 'number' || typeof c.tolerance !== 'number') throw new Error(`${where}: threshold and tolerance must be numbers`);
    return c;
  });
}

export const loadCriteria = (path = CRITERIA_PATH) => parseCriteria(readFileSync(path, 'utf8'));

export function valueOf(c: Criterion, t: MetricsTable): number | null {
  return (c.category === 'all' ? t.byColumn[c.column] : t.byCategory[c.category])[c.metric];
}

export const meets = (c: Criterion, v: number) => (c.direction === 'min' ? v >= c.threshold : v <= c.threshold);

export function verdicts(criteria: readonly Criterion[], t: MetricsTable): Verdict[] {
  return criteria.map((criterion) => {
    const value = valueOf(criterion, t);
    return { criterion, value, pass: value === null ? null : meets(criterion, value) };
  });
}
