// The benchmark end to end on a small in-memory data set.
import { beforeAll, describe, expect, it } from 'vitest';
import { runBenchmark, type BenchmarkResult } from '../../eval/benchmark';
import { loadCriteria } from '../../eval/criteria';
import type { LoadedData, ManifestEntry } from '../../eval/datasets';
import { AR_TYPES, EN_TYPES } from '../../eval/error-types';

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
      messages: [{ id: 't1', text: 'النضام يعمل الآن', labels: [{ start: 0, word: 'النضام', gold: 'misspelled', intended: 'النظام' }] }],
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

  it('measures engine latency', () => {
    expect(result.latency.en!.checkP95Ms).not.toBeNull();
  });
});
