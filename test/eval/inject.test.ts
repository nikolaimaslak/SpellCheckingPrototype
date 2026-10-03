import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { classify } from '../../eval/error-types';
import { injectMessages, injectWords } from '../../eval/inject';
import { toJsonl } from '../../eval/io';
import { createPipeline, type Pipeline } from '../../eval/pipeline';
import { fromTsv } from '../../eval/words';
import type { Message } from '../../eval/types';

let pipeline: Pipeline;
beforeAll(async () => {
  pipeline = await createPipeline({ customWords: ['GOSI'] });
});

const MESSAGES: Message[] = [
  { id: '1', text: 'Your request has been received and will be processed shortly.' },
  { id: '2', text: 'شكراً لتواصلك مع المساعدة الفنية، سنرد عليك قريباً.' },
  { id: '3', text: 'Hello $(user.firstName), your certificate is ready.', labels: [{ start: 6, word: '$(user.firstName)', gold: 'excluded' }] },
];

describe('misspelling inserter', () => {
  it('is reproducible for the same input, options and seed', async () => {
    const run = async () => toJsonl((await injectMessages(pipeline, MESSAGES, { langs: ['en', 'ar'], rate: 0.5, seed: 42 })).messages);
    expect(await run()).toBe(await run());
  });

  it('inserts only the selected Arabic type, labelled with the intended word', async () => {
    const { messages, stats } = await injectMessages(pipeline, [MESSAGES[1]], { langs: ['ar'], types: ['ta-marbuta'], rate: 1, seed: 1 });
    expect(messages[0].text).toContain('المساعده');
    const start = messages[0].text.indexOf('المساعده');
    expect(messages[0].labels).toContainEqual({ start, word: 'المساعده', gold: 'misspelled', intended: 'المساعدة', type: 'ta-marbuta' });
    expect(Object.keys(stats.inserted)).toEqual(['ta-marbuta']);
  });

  it('labels every inserted error so that it classifies as its type and aligns with the text', async () => {
    const { messages } = await injectMessages(pipeline, MESSAGES, { langs: ['en', 'ar'], rate: 1, seed: 7 });
    for (const m of messages) {
      for (const l of m.labels ?? []) {
        expect(m.text.slice(l.start, l.start + l.word.length)).toBe(l.word);
        if (l.gold === 'misspelled') expect(classify(l.word, l.intended!, /\p{Script=Arabic}/u.test(l.word) ? 'ar' : 'en')?.type).toBe(l.type);
      }
    }
  });

  it('keeps existing labels in place, shifted past earlier edits', async () => {
    const { messages } = await injectMessages(pipeline, [MESSAGES[2]], { langs: ['en'], rate: 1, seed: 3 });
    const excluded = messages[0].labels!.find((l) => l.gold === 'excluded')!;
    expect(messages[0].text.slice(excluded.start, excluded.start + excluded.word.length)).toBe('$(user.firstName)');
  });

  it('per-word mode: at most one variant per type, and inapplicable types are counted', async () => {
    const words = fromTsv(readFileSync('eval/datasets/words-ar.tsv', 'utf8')).slice(0, 100);
    const { messages, stats } = await injectWords(pipeline, words, { langs: ['ar'], types: ['hamza', 'dots'], perWord: true, seed: 1 });
    const perWordType = new Map<string, number>();
    for (const m of messages) perWordType.set(m.id, (perWordType.get(m.id) ?? 0) + 1);
    expect([...perWordType.values()].every((n) => n === 1)).toBe(true);
    expect(messages.every((m) => ['hamza', 'dots'].includes(m.labels![0].type!))).toBe(true);
    expect(stats.notApplicable.hamza).toBeGreaterThan(0); // most words have no hamza position
    expect((stats.inserted.hamza ?? 0) + (stats.notApplicable.hamza ?? 0) + (stats.realWord.hamza ?? 0)).toBeGreaterThanOrEqual(100 - 5);
  });

  it('discards real-word variants and counts them', async () => {
    let discarded = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { messages, stats } = await injectWords(pipeline, [{ word: 'from', lang: 'en' }], { langs: ['en'], types: ['transpose'], perWord: true, seed });
      expect(messages.map((m) => m.text)).not.toContain('form');
      discarded += stats.realWord.transpose ?? 0;
    }
    expect(discarded).toBeGreaterThan(0);
  });

  it('in mixed text, changes Arabic words with Arabic types and never a custom word', async () => {
    const { messages } = await injectMessages(pipeline, [{ id: 'm', text: 'رقم الطلب في نظام GOSI هو' }], {
      langs: ['en', 'ar'],
      rate: 1,
      seed: 5,
      customWords: ['GOSI'],
    });
    expect(messages[0].text).toContain(' GOSI ');
    const labels = messages[0].labels ?? [];
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(/\p{Script=Arabic}/u.test(l.word)).toBe(true);
  });

  it('runs as a command and writes byte-identical output for the same seed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inject-'));
    const run = (out: string) =>
      execFileSync(
        process.execPath,
        ['--import', './eval/register.ts', 'eval/cli/inject.ts', 'eval/datasets/clean-ar.jsonl', '--lang', 'ar', '--seed', '9', '--out', join(dir, out)],
        { encoding: 'utf8' },
      );
    expect(run('a.jsonl')).toMatch(/errors inserted/);
    run('b.jsonl');
    expect(readFileSync(join(dir, 'a.jsonl'), 'utf8')).toBe(readFileSync(join(dir, 'b.jsonl'), 'utf8'));
    const meta = JSON.parse(readFileSync(join(dir, 'a.meta.json'), 'utf8'));
    expect(meta).toMatchObject({ generator: 'eval/inject.ts', version: 1, options: { lang: 'ar', seed: 9 } });
  }, 60000);
});
