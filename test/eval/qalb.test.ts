import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAll } from '../../eval/datasets';
import { outcomesFor } from '../../eval/outcomes';
import { tokensOf, type TokenResult } from '../../eval/pipeline';
import { convert, isOrthographic, parseAreta, writePrivate } from '../../eval/qalb';
import type { Message } from '../../eval/types';

// Synthetic sentences in the ARETA layout; no corpus text.
const FIXTURE = readFileSync('test/fixtures/areta-sample.txt', 'utf8');
const wordsOf = (text: string) => tokensOf(text);
const { messages, counts } = convert(FIXTURE, 'sample', wordsOf);
const byId = (id: string) => messages.find((m) => m.id === id)!;
const label = (m: Message, word: string) => m.labels?.find((l) => l.word === word);

describe('ARETA import: tag mapping', () => {
  it('reads blank-line-separated sentences without the header', () => {
    expect(parseAreta(FIXTURE)).toHaveLength(5);
  });

  it('orthographic edit: misspelled with the correction; unchanged word unlabelled (spec: Orthographic edit)', () => {
    const m = byId('sample-1');
    expect(label(m, 'ليضهر')).toMatchObject({ gold: 'misspelled', intended: 'ليظهر' });
    expect(label(m, 'أنه')).toBeUndefined();
  });

  it('combined orthographic tags stay a misspelling (spec: Combined orthographic tags)', () => {
    expect(isOrthographic('REPLACE_OH+REPLACE_OM')).toBe(true);
    expect(isOrthographic('REPLACE_OH+REPLACE_XC')).toBe(false);
    expect(label(byId('sample-1'), 'انشاء')).toMatchObject({ gold: 'misspelled', intended: 'إنشاء' });
  });

  it('grammar edits are unscored (spec: Grammar edit unscored)', () => {
    const m = byId('sample-2');
    expect(label(m, 'مسلمون')?.gold).toBe('unscored');
    expect(label(m, 'يحب')?.gold).toBe('unscored');
  });

  it('merge and split are unscored on every source word; an insertion adds nothing (spec: Merge and split, Insertion)', () => {
    const m = byId('sample-3');
    expect(m.text).toBe('التصر فات لوكان أ واضحة');
    expect(['التصر', 'فات', 'لوكان'].map((w) => label(m, w)?.gold)).toEqual(['unscored', 'unscored', 'unscored']);
    expect(m.text).not.toContain('ذ');
  });

  it('drops and counts a label on a word the tokenizer never produces (spec: Word the tokenizer doesn’t check)', () => {
    // The deleted one-letter word "أ" is no token: its label is dropped, the sentence kept.
    expect(label(byId('sample-3'), 'أ')).toBeUndefined();
    expect(counts.dropped).toBe(1);
  });

  it('a Latin word tagged UC stays a correct English word (spec: Mixed text)', () => {
    const m = byId('sample-4');
    expect(m.labels).toBeUndefined();
    expect(tokensOf(m.text).find((t) => t.text === 'Facebook')?.lang).toBe('en');
  });

  it('skips and counts a sentence whose labelled word the tokenizer splits (spec: Label doesn’t align)', () => {
    expect(messages.find((m) => m.id === 'sample-5')).toBeUndefined();
    expect(counts).toEqual({ messages: 4, correct: 12, misspelled: 2, unscored: 5, dropped: 1, skipped: 1 });
  });

  it('every written message lines up with the benchmark’s own alignment check', () => {
    for (const m of messages) {
      const tokens: TokenResult[] = tokensOf(m.text).map((t) => ({
        word: t.text,
        lang: t.lang,
        start: t.start,
        end: t.end,
        flagged: false,
        suggestions: [],
        replacement: null,
        replacementSource: null,
        checkMs: 0,
        suggestMs: null,
        decideMs: null,
      }));
      expect(() => outcomesFor('sample', m, { tokens, transient: [] })).not.toThrow();
    }
  });

  it('--limit keeps the first sentences', () => {
    expect(convert(FIXTURE, 'sample', wordsOf, 2).messages.map((m) => m.id)).toEqual(['sample-1', 'sample-2']);
  });
});

describe('ARETA import: writing the private dataset', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'qalb-'));
    const dir = join(root, 'private');
    const licenseFile = join(root, 'LICENSE.txt');
    writeFileSync(licenseFile, 'Corpus license: internal research and evaluation only.\n');
    return { root, dir, licenseFile };
  };
  const options = (dir: string, licenseFile: string) => ({ dir, name: 'sample', input: 'test/fixtures/areta-sample.txt', source: 'synthetic fixture', license: 'test license', licenseFile });

  it('writes the data, the license beside it and a manifest entry the benchmark accepts', () => {
    const { root, dir, licenseFile } = setup();
    const { data, license, entry } = writePrivate(messages, options(dir, licenseFile));
    expect(readFileSync(license, 'utf8')).toContain('internal research');
    expect(entry).toMatchObject({ file: 'sample.jsonl', kind: 'private', lang: 'ar', license: 'test license', generator: { command: 'npm run eval:qalb' } });
    expect(JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).datasets).toHaveLength(1);
    expect(existsSync(data)).toBe(true);
    // The benchmark loads it: hash matches, and the license .txt is not an unlisted data file.
    const loaded = loadAll(root).datasets.find((d) => d.name === 'sample');
    expect(loaded?.messages).toHaveLength(4);
  });

  it('replaces its own manifest entry on a second run', () => {
    const { dir, licenseFile } = setup();
    writePrivate(messages, options(dir, licenseFile));
    writePrivate(messages.slice(0, 1), options(dir, licenseFile));
    expect(JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).datasets).toHaveLength(1);
  });

  it('fails without writing anything when the license file is missing (spec: No license file)', () => {
    const { dir } = setup();
    expect(() => writePrivate(messages, options(dir, join(dir, 'nope.txt')))).toThrow(/license file not found/);
    expect(existsSync(join(dir, 'sample.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'MANIFEST.json'))).toBe(false);
  });

  it('refuses a name that could leave the private directory', () => {
    const { dir, licenseFile } = setup();
    expect(() => writePrivate(messages, { ...options(dir, licenseFile), name: '../escape' })).toThrow(/invalid dataset name/);
  });
});

describe('eval:qalb CLI', () => {
  // Run from a temporary working directory, so it writes that directory's eval/datasets/private, never the repo's.
  const run = (cwd: string, args: string[]) =>
    execFileSync(process.execPath, ['--import', resolve('eval/register.ts'), resolve('eval/cli/qalb.ts'), resolve('test/fixtures/areta-sample.txt'), ...args], { cwd, encoding: 'utf8' });

  it('converts the fixture into the private directory and prints the counts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'qalb-cli-'));
    writeFileSync(join(cwd, 'LICENSE.txt'), 'test license\n');
    const out = run(cwd, ['--name', 'sample', '--source', 'fixture', '--license', 'test', '--license-file', join(cwd, 'LICENSE.txt')]);
    expect(out).toContain('4 messages; words: 12 correct, 2 misspelled, 5 unscored; 1 labels dropped');
    for (const f of ['sample.jsonl', 'sample.LICENSE.txt', 'MANIFEST.json']) expect(existsSync(join(cwd, 'eval/datasets/private', f))).toBe(true);
  }, 30000);

  it('fails without writing when the license file is missing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'qalb-cli-'));
    expect(() => run(cwd, ['--name', 'sample', '--source', 'fixture', '--license', 'test', '--license-file', join(cwd, 'missing.txt')])).toThrow();
    expect(existsSync(join(cwd, 'eval/datasets/private/sample.jsonl'))).toBe(false);
  }, 30000);
});
