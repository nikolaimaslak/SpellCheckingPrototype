import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPipeline, type Pipeline } from '../../eval/pipeline';
import { buildWordList, fromTsv, toTsv } from '../../eval/words';

let pipeline: Pipeline;
beforeAll(async () => {
  pipeline = await createPipeline({ customWords: ['GOSI'] });
});

describe('word lists', () => {
  it('counts correct English words and leaves out excluded tokens', async () => {
    const { entries, rejected } = await buildWordList(pipeline, ['Thank you for your request. Your request CS-104233 is approved.']);
    expect(entries.find((e) => e.word === 'request')).toEqual({ word: 'request', count: 2, lang: 'en' });
    expect(entries.some((e) => e.word.includes('104233') || e.word === 'CS')).toBe(false);
    expect(rejected.excluded).toBe(2); // "CS" and "104233", the segmenter's parts of the masked span
  });

  it('merges Arabic forms with and without diacritics', async () => {
    const { entries } = await buildWordList(pipeline, ['مَرْحَبًا', 'مرحبا']);
    expect(entries).toEqual([{ word: 'مرحبا', count: 2, lang: 'ar' }]);
  });

  it('rejects misspelled and mixed-script words', async () => {
    const { entries, rejected } = await buildWordList(pipeline, ['النضام GOSIنظام النظام']);
    expect(entries.map((e) => e.word)).toEqual(['النظام']);
    expect(rejected).toEqual({ excluded: 0, 'no-language': 1, misspelled: 1 });
  });

  it('keeps custom words and filters by language', async () => {
    const { entries } = await buildWordList(pipeline, ['GOSI الطلب GOSI'], ['en']);
    expect(entries).toEqual([{ word: 'GOSI', count: 2, lang: 'en' }]);
  });

  it('sorts by count, then word, and round-trips through TSV', async () => {
    const { entries } = await buildWordList(pipeline, ['the request the pension the request']);
    expect(entries.map((e) => [e.word, e.count])).toEqual([
      ['the', 3],
      ['request', 2],
      ['pension', 1],
    ]);
    expect(fromTsv(toTsv(entries))).toEqual(entries);
  });

  it('runs as a command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'words-'));
    writeFileSync(join(dir, 'in.txt'), 'Your request is approved.\nشكرا لتواصلك مع التأمينات\n');
    const out = execFileSync(
      process.execPath,
      ['--import', './eval/register.ts', 'eval/cli/words.ts', join(dir, 'in.txt'), '--out', join(dir, 'words.tsv')],
      { encoding: 'utf8' },
    );
    expect(out).toMatch(/words\.tsv: \d+ words/);
    const list = fromTsv(readFileSync(join(dir, 'words.tsv'), 'utf8'));
    expect(list.map((e) => e.word)).toContain('التأمينات');
  });
});
