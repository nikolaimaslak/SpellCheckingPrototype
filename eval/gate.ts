// The regression gate: compares a benchmark result with the committed
// baseline (eval/baseline.json). It fails on any new corruption or wrong fix,
// on more exclusion leaks, and on a criterion metric that got worse than its
// tolerance allows. Per-type changes are reported but never fail it.
import type { BenchmarkResult } from './benchmark.ts';
import type { Criterion } from './criteria.ts';
import type { Lang } from './error-types.ts';
import type { FixSource, SourceMetrics } from './metrics.ts';

const LANGS: Lang[] = ['en', 'ar'];

export interface Baseline {
  build: BenchmarkResult['build'];
  /** Criterion id → value. */
  criteria: Record<string, number | null>;
  counts: Partial<Record<Lang, { corruption: number; wrongFix: number }>>;
  exclusionLeaks: number;
  /** Identities of the corruptions and wrong fixes per language, so new ones can be named. */
  identities: BenchmarkResult['identities'];
  /** Per language and error type: detection recall, correction@1, auto-replace coverage. */
  byType: Partial<Record<Lang, Record<string, { detectionRecall: number | null; correctionAt1: number | null; autoReplaceCoverage: number | null }>>>;
  /** Per language and auto-replace source, for information only: never compared by the gate. */
  bySource?: Partial<Record<Lang, Record<FixSource, SourceMetrics>>>;
}

export interface GateResult {
  regressions: string[];
  improvements: string[];
  typeChanges: string[];
}

export function toBaseline(r: BenchmarkResult): Baseline {
  const counts: Baseline['counts'] = {};
  const byType: Baseline['byType'] = {};
  for (const lang of LANGS) {
    const c = r.summary.scopes.all[lang]?.counts;
    if (c) counts[lang] = { corruption: c.corruption, wrongFix: c.wrongFix };
    const types = r.byLang[lang]?.byType ?? {};
    byType[lang] = Object.fromEntries(
      Object.entries(types).map(([t, m]) => [t, { detectionRecall: m.detectionRecall, correctionAt1: m.correctionAt1, autoReplaceCoverage: m.autoReplaceCoverage }]),
    );
  }
  return {
    build: r.build,
    criteria: Object.fromEntries(r.verdicts.map((v) => [v.criterion.id, v.value])),
    counts,
    exclusionLeaks: r.summary.scopes.all.all?.counts.exclusionLeaks ?? 0,
    identities: r.identities,
    byType,
    bySource: Object.fromEntries(LANGS.flatMap((lang) => (r.byLang[lang]?.bySource ? [[lang, r.byLang[lang]!.bySource]] : []))),
  };
}

const fmt = (x: number) => (Math.abs(x) < 1 && x !== 0 ? `${(x * 100).toFixed(2)}%` : String(Math.round(x * 100) / 100));

export function compare(r: BenchmarkResult, base: Baseline, criteria: Criterion[]): GateResult {
  const now = toBaseline(r);
  const regressions: string[] = [];
  const improvements: string[] = [];
  const typeChanges: string[] = [];

  for (const lang of LANGS) {
    const a = base.counts[lang];
    const b = now.counts[lang];
    if (!a || !b) continue;
    for (const [key, label, list, baseList] of [
      ['corruption', 'corruptions', now.identities[lang]?.corruptions ?? [], base.identities?.[lang]?.corruptions ?? []],
      ['wrongFix', 'wrong fixes', now.identities[lang]?.wrongFixes ?? [], base.identities?.[lang]?.wrongFixes ?? []],
    ] as const) {
      if (b[key] > a[key]) {
        const added = list.filter((x) => !baseList.includes(x));
        regressions.push(`${lang}: ${label} went from ${a[key]} to ${b[key]}${added.length ? `; new: ${added.join('; ')}` : ''}`);
      } else if (b[key] < a[key]) improvements.push(`${lang}: ${label} went from ${a[key]} to ${b[key]}`);
    }
  }
  if (now.exclusionLeaks > base.exclusionLeaks) regressions.push(`exclusion leaks went from ${base.exclusionLeaks} to ${now.exclusionLeaks}`);
  else if (now.exclusionLeaks < base.exclusionLeaks) improvements.push(`exclusion leaks went from ${base.exclusionLeaks} to ${now.exclusionLeaks}`);

  for (const c of criteria) {
    if (c.compare === false) continue;
    const before = base.criteria[c.id];
    const after = now.criteria[c.id];
    if (before === null || before === undefined || after === null || after === undefined) continue;
    const worse = c.direction === 'min' ? before - after : after - before;
    if (worse > c.tolerance + 1e-9) regressions.push(`${c.label} (${c.lang}): ${fmt(before)} → ${fmt(after)}, beyond the tolerance of ${fmt(c.tolerance)}`);
    else if (worse < -1e-9) improvements.push(`${c.label} (${c.lang}): ${fmt(before)} → ${fmt(after)}`);
  }

  for (const lang of LANGS) {
    for (const [type, after] of Object.entries(now.byType[lang] ?? {})) {
      const before = base.byType[lang]?.[type];
      if (!before) continue;
      for (const k of ['detectionRecall', 'correctionAt1', 'autoReplaceCoverage'] as const) {
        const x = before[k];
        const y = after[k];
        if (x !== null && y !== null && Math.abs(y - x) >= 0.01) typeChanges.push(`${lang} ${type} ${k}: ${fmt(x)} → ${fmt(y)}`);
      }
    }
  }
  return { regressions, improvements, typeChanges };
}
