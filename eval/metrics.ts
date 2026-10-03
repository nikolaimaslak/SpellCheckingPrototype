// Metrics over word outcomes, in three layers:
//   detection   — is a misspelling flagged, and are correct words left alone?
//   correction  — is the intended word the system's correction (rank 1) or
//                 among its first five, applied automatically or offered?
//   auto-replace — which corrections are applied, and is any correct word changed?
import type { ErrorType } from './error-types.ts';
import type { WordOutcome } from './types.ts';

export interface Counts {
  correct: number;
  untouched: number;
  falseFlag: number;
  corruption: number;
  misspelled: number;
  missed: number;
  detected: number;
  fixed: number;
  wrongFix: number;
  flagged: number;
  rank1: number;
  rank5: number;
  excluded: number;
  exclusionLeaks: number;
}

export interface Metrics {
  counts: Counts;
  // Detection
  detectionRecall: number | null;
  falseFlagRate: number | null;
  detectionPrecision: number | null;
  // Correction
  correctionAt1: number | null;
  correctionAt5: number | null;
  correctionAt1Detected: number | null;
  correctionAt5Detected: number | null;
  // Auto-replace
  autoReplacePrecision: number | null;
  autoReplaceCoverage: number | null;
  corruptionPer10k: number | null;
  /** 95% upper bound of the corruption rate per 10,000 correct words. */
  corruptionUpper95Per10k: number | null;
}

const ratio = (a: number, b: number) => (b ? a / b : null);

/** Upper end of the 95% Wilson score interval; the "rule of three" when nothing was seen. */
export function upper95(k: number, n: number): number | null {
  if (!n) return null;
  if (k === 0) return 3 / n;
  const z = 1.96;
  const p = k / n;
  return (p + (z * z) / (2 * n) + z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
}

export function countOutcomes(outcomes: WordOutcome[]): Counts {
  const c: Counts = {
    correct: 0,
    untouched: 0,
    falseFlag: 0,
    corruption: 0,
    misspelled: 0,
    missed: 0,
    detected: 0,
    fixed: 0,
    wrongFix: 0,
    flagged: 0,
    rank1: 0,
    rank5: 0,
    excluded: 0,
    exclusionLeaks: 0,
  };
  for (const o of outcomes) {
    switch (o.outcome) {
      case 'untouched':
        c.untouched++;
        break;
      case 'false-flag':
        c.falseFlag++;
        break;
      case 'corruption':
        c.corruption++;
        break;
      case 'missed':
        c.missed++;
        break;
      case 'fixed':
        c.fixed++;
        break;
      case 'wrong-fix':
        c.wrongFix++;
        break;
      case 'flagged':
        c.flagged++;
        break;
      case 'excluded':
        c.excluded++;
        break;
      case 'exclusion-leak':
        c.exclusionLeaks++;
        break;
    }
    if (o.gold === 'correct') c.correct++;
    if (o.gold === 'misspelled') {
      c.misspelled++;
      if (o.outcome !== 'missed') c.detected++;
      if (o.rank === 1) c.rank1++;
      if (o.rank !== null && o.rank <= 5) c.rank5++;
    }
  }
  return c;
}

export function computeMetrics(outcomes: WordOutcome[]): Metrics {
  const c = countOutcomes(outcomes);
  const per10k = (k: number) => (c.correct ? (k / c.correct) * 10000 : null);
  const up = upper95(c.corruption, c.correct);
  return {
    counts: c,
    detectionRecall: ratio(c.detected, c.misspelled),
    falseFlagRate: ratio(c.falseFlag + c.corruption, c.correct),
    detectionPrecision: ratio(c.detected, c.detected + c.falseFlag + c.corruption),
    correctionAt1: ratio(c.rank1, c.misspelled),
    correctionAt5: ratio(c.rank5, c.misspelled),
    correctionAt1Detected: ratio(c.rank1, c.detected),
    correctionAt5Detected: ratio(c.rank5, c.detected),
    autoReplacePrecision: ratio(c.fixed, c.fixed + c.wrongFix + c.corruption),
    autoReplaceCoverage: ratio(c.fixed, c.misspelled),
    corruptionPer10k: per10k(c.corruption),
    corruptionUpper95Per10k: up === null ? null : up * 10000,
  };
}

/** Groups outcomes by a key, in first-seen order. */
export function groupBy<K extends string>(outcomes: WordOutcome[], key: (o: WordOutcome) => K | null): Map<K, WordOutcome[]> {
  const groups = new Map<K, WordOutcome[]>();
  for (const o of outcomes) {
    const k = key(o);
    if (k === null) continue;
    const g = groups.get(k) ?? [];
    g.push(o);
    groups.set(k, g);
  }
  return groups;
}

/** Misspelling metrics per error type. */
export function byErrorType(outcomes: WordOutcome[]): Map<ErrorType | 'unknown', Metrics> {
  const misspelled = outcomes.filter((o) => o.gold === 'misspelled');
  const groups = groupBy(misspelled, (o) => o.errorType ?? 'unknown');
  return new Map([...groups].map(([k, v]) => [k, computeMetrics(v)]));
}

export interface MatrixRow {
  type: ErrorType;
  generated: number;
  realWordDiscards: number;
  notApplicable: number;
  detectionRecall: number | null;
  correctionAt1: number | null;
  correctionAt5: number | null;
  autoReplaceCoverage: number | null;
  wrongFixes: number;
}

/** The error-type matrix: one row per type, from per-word variants evaluated alone. */
export function matrixRows(
  types: readonly ErrorType[],
  outcomes: WordOutcome[],
  stats: { inserted: Partial<Record<string, number>>; realWord: Partial<Record<string, number>>; notApplicable: Partial<Record<string, number>> },
): MatrixRow[] {
  const groups = groupBy(
    outcomes.filter((o) => o.gold === 'misspelled'),
    (o) => o.errorType,
  );
  return types.map((type) => {
    const m = computeMetrics(groups.get(type) ?? []);
    return {
      type,
      generated: stats.inserted[type] ?? 0,
      realWordDiscards: stats.realWord[type] ?? 0,
      notApplicable: stats.notApplicable[type] ?? 0,
      detectionRecall: m.detectionRecall,
      correctionAt1: m.correctionAt1,
      correctionAt5: m.correctionAt5,
      autoReplaceCoverage: m.autoReplaceCoverage,
      wrongFixes: m.counts.wrongFix,
    };
  });
}

export interface CorrectionTypes {
  /** Correction type → count, over all detected tokens with a correction. */
  distribution: Record<string, number>;
  /** Error type → correction type → count, over detected misspellings. "none" when there was no correction. */
  table: Record<string, Record<string, number>>;
  /** Corrections that hit the intended word, per error type (the diagonal, by outcome rather than by type label). */
  onTarget: Record<string, number>;
  corruptions: Record<string, number>;
  wrongFixes: Record<string, number>;
}

const add = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);

export function correctionTypes(outcomes: WordOutcome[]): CorrectionTypes {
  const result: CorrectionTypes = { distribution: {}, table: {}, onTarget: {}, corruptions: {}, wrongFixes: {} };
  for (const o of outcomes) {
    const detected = o.outcome !== 'untouched' && o.outcome !== 'missed' && o.gold !== 'excluded';
    if (!detected) continue;
    const ct = o.correctionType ?? 'none';
    if (o.correctionType) add(result.distribution, ct);
    if (o.outcome === 'corruption') add(result.corruptions, ct);
    if (o.outcome === 'wrong-fix') add(result.wrongFixes, ct);
    if (o.gold === 'misspelled') {
      const et = o.errorType ?? 'unknown';
      add((result.table[et] ??= {}), ct);
      if (o.rank === 1) add(result.onTarget, et);
    }
  }
  return result;
}

/** The p-th percentile (0–100) by nearest rank, or null for no values. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
