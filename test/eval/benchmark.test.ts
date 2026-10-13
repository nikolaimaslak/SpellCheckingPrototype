// The benchmark end to end on a small in-memory data set.
import { beforeAll, describe, expect, it } from 'vitest';
import { runBenchmark, stabilityOf, type BenchmarkResult } from '../../eval/benchmark';
import { loadCriteria } from '../../eval/criteria';
import type { LoadedData, ManifestEntry } from '../../eval/datasets';
import { AR_TYPES, EN_TYPES } from '../../eval/error-types';
import type { WordOutcome } from '../../eval/types';

const entry = (file: string, kind: ManifestEntry['kind'], lang: ManifestEntry['lang']): ManifestEntry => ({ file, kind, lang, source: 'test', license: 'test', sha256: '' });

const data: LoadedData = {
  datasets: [
    {
      name: 'clean-en',
      entry: entry('clean-en.jsonl', 'clean', 'en'),
      customWords: ['GOSI'],
      messages: [
        { id: 'c1', text: 'Thank you for contacting GOSI, your request has been received.' },
        { id: 'c2', text: 'Case CS-104233 is closed.', labels: [{ start: 5, word: 'CS-104233', gold: 'excluded' }] },
      ],
    },
    {
      name: 'typos-ar',
      entry: entry('typos-ar.jsonl', 'typos', 'ar'),
      customWords: [],
      messages: [{ id: 't1', text: 'المستخذم يعمل الآن', labels: [{ start: 0, word: 'المستخذم', gold: 'misspelled', intended: 'المستخدم' }] }],
    },
    {
      name: 'pilot',
      entry: entry('pilot.jsonl', 'private', 'en'),
      customWords: [],
      messages: [{ id: 'p1', text: 'Please seperate the PRIVATEWORDX files', labels: [{ start: 7, word: 'seperate', gold: 'misspelled', intended: 'separate' }] }],
    },
  ],
  wordLists: [
    { name: 'words-en', entry: entry('words-en.tsv', 'wordlist', 'en'), words: ['request', 'payment', 'account', 'pension'].map((word) => ({ word, count: 1, lang: 'en' as const })) },
    { name: 'words-ar', entry: entry('words-ar.tsv', 'wordlist', 'ar'), words: ['المساعدة', 'التأمينات', 'على', 'النظام'].map((word) => ({ word, count: 1, lang: 'ar' as const })) },
  ],
};

let result: BenchmarkResult;
beforeAll(async () => {
  result = await runBenchmark(data, loadCriteria(), { matrixWords: 4, skipLoadedRun: true });
}, 120000);

describe('benchmark', () => {
  it('evaluates every dataset and judges every criterion', () => {
    expect(result.datasets.map((d) => d.name)).toEqual(['clean-en', 'typos-ar', 'pilot']);
    expect(result.verdicts.length).toBe(loadCriteria().length);
    expect(result.summary.scopes.misspelled.ar!.counts.fixed).toBe(1);
    expect(result.summary.scopes.clean.all!.counts.excluded).toBe(1);
  });

  it('builds a matrix row for every error type of each language', () => {
    expect(result.matrix.en!.rows.map((r) => r.type)).toEqual([...EN_TYPES]);
    expect(result.matrix.ar!.rows.map((r) => r.type)).toEqual([...AR_TYPES]);
    const ta = result.matrix.ar!.rows.find((r) => r.type === 'ta-marbuta')!;
    expect(ta.generated + ta.notApplicable + ta.realWordDiscards).toBeGreaterThan(0);
  });

  it('keeps private datasets out of criteria and examples', () => {
    expect(JSON.stringify(result.examples)).not.toContain('PRIVATEWORDX');
    expect(result.summary.scopes.all.en!.counts.misspelled).toBe(0); // the private typo isn't in the committed scope
    expect(result.datasets.find((d) => d.name === 'pilot')!.metrics.counts.misspelled).toBe(1);
  });

  it('measures engine latency, including the auto-replace decision', () => {
    expect(result.latency.en!.checkP95Ms).not.toBeNull();
    expect(result.latency.ar!.decideP95Ms).not.toBeNull();
  });

  it('reports both instability counts', () => {
    expect(result.instability.total).toBe(0);
    expect(result.suggestionInstability.byLang).toEqual({ en: 0, ar: 0, all: 0 });
  });
});

describe('stability', () => {
  const token = (over: Partial<WordOutcome>): WordOutcome => ({
    dataset: 'injected-ar',
    messageId: 'm1',
    lang: 'ar',
    word: 'الإلكترونيى',
    start: 0,
    gold: 'misspelled',
    intended: 'الإلكترونية',
    errorType: 'keyboard-sub',
    realWord: null,
    rank: null,
    replacement: null,
    source: null,
    corrections: [],
    correctionType: null,
    context: '',
    outcome: 'flagged',
    ...over,
  });

  it('counts a changed top suggestion as suggestion instability only', () => {
    const a = token({ corrections: ['ألإلكترونيي'] });
    const b = token({ corrections: ['الإلكترونية'] });
    const { decision, suggestion, outcomes } = stabilityOf([[a], [a], [a], [b]], new Set());
    expect(decision.byLang).toEqual({ en: 0, ar: 0, all: 0 });
    expect(suggestion.byLang).toEqual({ en: 0, ar: 1, all: 1 });
    expect(suggestion.examples[0].runs).toEqual(['flagged ألإلكترونيي -', 'flagged ألإلكترونيي -', 'flagged ألإلكترونيي -', 'flagged الإلكترونية -']);
    expect(outcomes).toEqual([a]);
  });

  it('counts a changed auto-replacement as decision instability', () => {
    const flagged = token({ corrections: ['وإليك'] });
    const fixed = token({ outcome: 'fixed', replacement: 'وإليك', corrections: ['وإليك'] });
    const { decision, suggestion } = stabilityOf([[flagged], [flagged], [flagged], [fixed]], new Set());
    expect(decision.byLang).toEqual({ en: 0, ar: 1, all: 1 });
    expect(suggestion.total).toBe(0);
  });

  it('keeps private datasets out of the examples', () => {
    const a = token({ dataset: 'pilot', corrections: ['x'] });
    const b = token({ dataset: 'pilot', outcome: 'fixed', replacement: 'y', corrections: ['y'] });
    const { decision } = stabilityOf([[a], [b], [a]], new Set(['pilot']));
    expect(decision.total).toBe(1);
    expect(decision.examples).toEqual([]);
  });
});
