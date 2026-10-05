import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { identity, type BenchmarkResult } from '../../eval/benchmark';
import { judge, type Criterion } from '../../eval/criteria';
import { compare, toBaseline } from '../../eval/gate';
import { computeMetrics, correctionTypes } from '../../eval/metrics';
import { renderMarkdown, writeReports } from '../../eval/report';
import type { Outcome, WordOutcome } from '../../eval/types';

const o = (over: Partial<WordOutcome> & { outcome: Outcome }): WordOutcome => ({
  dataset: 'clean-en',
  messageId: 'clean-en-9',
  lang: 'en',
  word: 'word',
  start: 0,
  gold: 'correct',
  intended: null,
  errorType: null,
  rank: null,
  replacement: null,
  corrections: [],
  correctionType: null,
  context: '',
  ...over,
});

const CORRUPTION = o({
  outcome: 'corruption',
  word: 'Musaned',
  replacement: 'Mustard',
  correctionType: 'multi',
  context: 'Your Musaned request is approved',
});

const criteria: Criterion[] = [
  { id: 'corruption-en', label: 'Corruption rate', metric: 'corruptionPer10k', scope: 'clean', lang: 'en', threshold: 1, direction: 'max', tolerance: 0, gate: true },
  { id: 'correction-at5-en', label: 'Correction accuracy@5', metric: 'correctionAt5', scope: 'misspelled', lang: 'en', threshold: 0.9, direction: 'min', tolerance: 0.01 },
];

/** A result from committed outcomes plus one private dataset that is only ever aggregated. */
function result(committed: WordOutcome[], extraMisspelled: WordOutcome[] = []): BenchmarkResult {
  const all = [...committed, ...extraMisspelled];
  const metrics = computeMetrics(all);
  const scopes = {
    clean: { en: computeMetrics(committed.filter((x) => x.gold !== 'misspelled')), all: metrics },
    misspelled: { en: computeMetrics(extraMisspelled), all: computeMetrics(extraMisspelled) },
    all: { en: metrics, all: metrics },
  };
  const summary = { scopes, instability: { en: 0, all: 0 }, latency: {} };
  const privateOutcomes = [o({ outcome: 'corruption', dataset: 'pilot', word: 'SECRETWORD', replacement: 'SECRET', context: 'a SECRETWORD message' })];
  return {
    build: { version: '0.1.0', commit: 'abc1234', date: '2026-10-03T00:00:00Z' },
    datasets: [
      { name: 'clean-en', kind: 'clean', lang: 'en', private: false, messages: 1, metrics, byType: {}, typeDistribution: {}, correctionTypes: correctionTypes(committed) },
      {
        name: 'pilot',
        kind: 'private',
        lang: 'ar',
        private: true,
        messages: 1,
        metrics: computeMetrics(privateOutcomes),
        byType: {},
        typeDistribution: { hamza: 1 },
        correctionTypes: correctionTypes(privateOutcomes),
      },
    ],
    summary,
    verdicts: judge(criteria, summary),
    byLang: { en: { metrics, byType: {}, correctionTypes: correctionTypes(all) } },
    matrix: {},
    instability: { total: 0, byLang: {}, examples: [] },
    suggestionInstability: { total: 0, byLang: {}, examples: [] },
    examples: { corruptions: committed.filter((x) => x.outcome === 'corruption'), wrongFixes: [], exclusionLeaks: [] },
    identities: { en: { corruptions: committed.filter((x) => x.outcome === 'corruption').map(identity), wrongFixes: [] } },
    latency: {},
  };
}

const clean = (n: number) => Array.from({ length: n }, (_, i) => o({ outcome: 'untouched', messageId: String(i) }));
const typos = (rank1: number, rank5: number, none: number) => [
  ...Array.from({ length: rank1 }, () => o({ outcome: 'flagged', gold: 'misspelled', intended: 'x', rank: 1, errorType: 'dots' })),
  ...Array.from({ length: rank5 }, () => o({ outcome: 'flagged', gold: 'misspelled', intended: 'x', rank: 3, errorType: 'dots' })),
  ...Array.from({ length: none }, () => o({ outcome: 'flagged', gold: 'misspelled', intended: 'x', rank: null, errorType: 'dots' })),
];

describe('report', () => {
  it('lists a corruption with its replacement, correction type and message (spec: Corruption listed)', () => {
    const md = renderMarkdown(result([...clean(10), CORRUPTION]));
    expect(md).toContain('<bdi>Musaned</bdi> → <bdi>Mustard</bdi>, correction type multi — clean-en clean-en-9: <bdi>Your Musaned request is approved</bdi>');
    expect(md).toMatch(/🔒 Corruption rate \| en \| .* \| ≤ 1\.0 \| ❌/);
  });

  it('shows decision and suggestion instability separately, and decision time', () => {
    const r = result(clean(5));
    const ex = (runs: string[]) => ({ dataset: 'injected-ar', messageId: 'm1', word: 'الإلكترونيى', runs, context: '' });
    r.instability = { total: 1, byLang: { ar: 1, all: 1 }, examples: [ex(['flagged x -', 'fixed y y'])] };
    r.suggestionInstability = { total: 2, byLang: { ar: 2, all: 2 }, examples: [ex(['flagged a -', 'flagged b -'])] };
    r.latency = { ar: { checkP95Ms: 0.02, suggestP95Ms: 120, decideP95Ms: 40 } };
    const md = renderMarkdown(r);
    expect(md).toContain('Decision instability: tokens whose flag or auto-replacement differed between runs (including the run under CPU load): **1**.');
    expect(md).toMatch(/Suggestion instability \(no threshold\): .*\*\*2\*\*/);
    expect(md).toContain('<bdi>flagged a -</bdi> / <bdi>flagged b -</bdi>');
    expect(md).toContain('| Language | Check p95 (ms) | Correction p95 (ms) | Decision p95 (ms) |');
  });

  it('never writes a private dataset’s words', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-'));
    const { json, md } = writeReports(result(clean(5)), dir);
    for (const file of [json, md]) expect(readFileSync(file, 'utf8')).not.toMatch(/SECRET/);
    expect(readFileSync(md, 'utf8')).toContain('private (aggregates only)');
  });
});

describe('regression gate', () => {
  const base = toBaseline(result([...clean(100)], typos(80, 15, 5)));

  it('fails on a new corruption and names it (spec: New corruption)', () => {
    const gate = compare(result([...clean(100), CORRUPTION], typos(80, 15, 5)), base, criteria);
    expect(gate.regressions.join('\n')).toMatch(/en: corruptions went from 0 to 1; new: clean-en clean-en-9 "Musaned" → "Mustard"/);
  });

  it('passes within tolerance (spec: Within tolerance)', () => {
    // Top 5 drops from 95% to 94.5%: within the 1-point tolerance.
    const before = toBaseline(result(clean(100), typos(160, 30, 10)));
    const gate = compare(result(clean(100), typos(160, 29, 11)), before, criteria);
    expect(gate.regressions).toEqual([]);
  });

  it('fails beyond tolerance and reports improvements', () => {
    expect(compare(result(clean(100), typos(80, 10, 10)), base, criteria).regressions.join('\n')).toMatch(/Correction accuracy@5 \(en\): 95\.00% → 90\.00%/);
    expect(compare(result(clean(100), typos(90, 9, 1)), base, criteria).improvements.join('\n')).toMatch(/Correction accuracy@5/);
  });

  it('does not compare load-dependent criteria with the baseline (spec: Load-dependent values)', () => {
    const noisy: Criterion[] = [{ id: 'instability-en', label: 'Decision instability', metric: 'instability', scope: 'all', lang: 'en', threshold: 0, direction: 'max', tolerance: 0, compare: false }];
    const before = toBaseline(result(clean(100), typos(80, 15, 5)));
    const now = result(clean(100), typos(80, 15, 5));
    now.summary.instability = { en: 5, all: 5 };
    now.verdicts = judge(noisy, now.summary);
    expect(compare(now, before, noisy).regressions).toEqual([]);
    expect(now.verdicts[0].pass).toBe(false);
  });

  it('reports per-type changes without failing (spec: Per-type drop)', () => {
    const now = result(clean(100), typos(80, 15, 5));
    now.byLang.ar = { metrics: computeMetrics([]), byType: { dots: computeMetrics(typos(50, 0, 50)) }, correctionTypes: correctionTypes([]) };
    const before = { ...base, byType: { ...base.byType, ar: { dots: { detectionRecall: 1, correctionAt1: 0.8, autoReplaceCoverage: 0 } } } };
    const gate = compare(now, before, criteria);
    expect(gate.regressions).toEqual([]);
    expect(gate.typeChanges).toContain('ar dots correctionAt1: 80.00% → 50.00%');
  });
});
