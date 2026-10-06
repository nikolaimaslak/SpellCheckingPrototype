// Completion metrics over repeated samples, per language column and category.
import { CATEGORIES, CASE_LANGS, type Category, type CaseLang, type CompletionCase } from './cases.ts';
import { inventions, seamOk, spacingError, type Reply } from './judge.ts';

export interface Sample {
  reply: Reply | null;
  /** Everything the model was given (the user prompt); the invention check's context. */
  user: string;
  ms: number;
  error?: string;
}

export interface CaseResult {
  case: CompletionCase;
  samples: Sample[];
}

export type Column = CaseLang | 'all';
export const COLUMNS: Column[] = [...CASE_LANGS, 'all'];

export interface Metrics {
  cases: number;
  samples: number;
  shownRate: number | null;
  formatRate: number | null;
  errorRate: number | null;
  /** Over shown samples of cases with a seam word. */
  seamAccuracy: number | null;
  /** Over shown samples. */
  spacingErrorRate: number | null;
  /** Over shown samples. */
  inventionRate: number | null;
  /** Share of cases whose samples all agree on shown or not shown. */
  shownAgreement: number | null;
  /** Mean number of distinct non-empty completions per case. */
  distinctPerCase: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
}

/** Per-case figures for the report. */
export interface CaseSummary {
  id: string;
  lang: CaseLang;
  category: Category;
  samples: number;
  shown: number;
  format: number;
  errors: number;
  seamChecked: number;
  seamOk: number;
  distinct: number;
  example: string;
  inventions: string[];
}

const rate = (n: number, d: number) => (d ? n / d : null);

export function percentile(xs: readonly number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

export function summarizeCase({ case: c, samples }: CaseResult): CaseSummary {
  const shown = samples.filter((s) => s.reply?.completion);
  const seams = shown.map((s) => seamOk(c, s.reply!.completion)).filter((v): v is boolean => v !== null);
  const found = new Set<string>();
  for (const s of shown) for (const d of inventions(s.reply!.completion, c.prefix + '\n' + s.user, c.mustNotInvent)) found.add(d);
  const distinct = new Set(shown.map((s) => s.reply!.completion));
  return {
    id: c.id,
    lang: c.lang,
    category: c.category,
    samples: samples.length,
    shown: shown.length,
    format: samples.filter((s) => s.reply?.withheld === 'format').length,
    errors: samples.filter((s) => !s.reply).length,
    seamChecked: seams.length,
    seamOk: seams.filter(Boolean).length,
    distinct: distinct.size,
    example: shown[0]?.reply!.completion ?? '',
    inventions: [...found],
  };
}

export function metricsOf(results: readonly CaseResult[]): Metrics {
  const all = results.flatMap((r) => r.samples.map((s) => ({ c: r.case, s })));
  const shown = all.filter(({ s }) => s.reply?.completion);
  const seams = shown.map(({ c, s }) => seamOk(c, s.reply!.completion)).filter((v): v is boolean => v !== null);
  const ms = all.filter(({ s }) => s.reply).map(({ s }) => s.ms);
  const agree = results.filter((r) => r.samples.length && new Set(r.samples.map((s) => !!s.reply?.completion)).size === 1).length;
  return {
    cases: results.length,
    samples: all.length,
    shownRate: rate(shown.length, all.length),
    formatRate: rate(all.filter(({ s }) => s.reply?.withheld === 'format').length, all.length),
    errorRate: rate(all.filter(({ s }) => !s.reply).length, all.length),
    seamAccuracy: rate(seams.filter(Boolean).length, seams.length),
    spacingErrorRate: rate(shown.filter(({ c, s }) => spacingError(c.prefix, s.reply!.completion)).length, shown.length),
    inventionRate: rate(shown.filter(({ c, s }) => inventions(s.reply!.completion, c.prefix + '\n' + s.user, c.mustNotInvent).length > 0).length, shown.length),
    shownAgreement: rate(agree, results.length),
    distinctPerCase: results.length ? results.reduce((n, r) => n + new Set(r.samples.filter((s) => s.reply?.completion).map((s) => s.reply!.completion)).size, 0) / results.length : null,
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
  };
}

export interface MetricsTable {
  byColumn: Record<Column, Metrics>;
  byCategory: Record<Category, Metrics>;
}

export function metricsTable(results: readonly CaseResult[]): MetricsTable {
  const byColumn = Object.fromEntries(COLUMNS.map((col) => [col, metricsOf(col === 'all' ? results : results.filter((r) => r.case.lang === col))])) as Record<Column, Metrics>;
  const byCategory = Object.fromEntries(CATEGORIES.map((cat) => [cat, metricsOf(results.filter((r) => r.case.category === cat))])) as Record<Category, Metrics>;
  return { byColumn, byCategory };
}
