// The eval pipeline drives the real engine and dictionaries, as the composer does.
import { beforeAll, describe, expect, it } from 'vitest';
import { createPipeline, type Pipeline } from '../../eval/pipeline';

let pipeline: Pipeline;
beforeAll(async () => {
  pipeline = await createPipeline({ customWords: ['GOSI', 'Absher'] });
});

const run = async (text: string) => (await pipeline.run(text)).tokens;
const byWord = async (text: string) => Object.fromEntries((await run(text)).map((t) => [t.word, t]));

describe('eval pipeline', () => {
  it('flags, suggests and auto-replaces a clear English slip', async () => {
    const r = await byWord('please seperate them');
    expect(r.please.flagged).toBe(false);
    expect(r.seperate.flagged).toBe(true);
    expect(r.seperate.suggestions[0]).toBe('separate');
    expect(r.seperate.replacement).toBe('separate');
  });

  it('auto-replaces a clear Arabic slip', async () => {
    const r = await byWord('النضام');
    expect(r['النضام'].replacement).toBe('النظام');
  });

  it('routes each word of a mixed message to its own language', async () => {
    const tokens = await run('رقم النضام هو paymnet');
    expect(tokens.map((t) => [t.word, t.lang, t.replacement])).toEqual([
      ['رقم', 'ar', null],
      ['النضام', 'ar', 'النظام'],
      ['هو', 'ar', null],
      ['paymnet', 'en', 'payment'],
    ]);
  });

  it('leaves ambiguous slips as suggestions', async () => {
    const r = await byWord('I will recieve it');
    expect(r.recieve.flagged).toBe(true);
    expect(r.recieve.replacement).toBeNull();
  });

  it('produces no tokens for excluded spans', async () => {
    const words = (await run('case CS-104233 and طلب ١٢٣٤٥ for $(user.firstName) at https://gosi.gov.sa')).map((t) => t.word);
    expect(words).toEqual(['case', 'and', 'طلب', 'for', 'at']);
  });

  it('accepts custom words', async () => {
    const r = await byWord('GOSI and Absher');
    expect(r.GOSI.flagged).toBe(false);
    expect(r.Absher.flagged).toBe(false);
  });

  it('judges auto-replacement in typing order, as the composer does', async () => {
    // "gosi" is completed by the "." before the address is recognizable as an email.
    const { tokens, transient } = await pipeline.run('mail info@gosi.gov.sa today');
    expect(tokens.map((t) => t.word)).toEqual(['mail', 'today']);
    expect(transient).toEqual([{ word: 'gosi', lang: 'en', start: 10, end: 14, replacement: 'gosh' }]);
  });

  it('measures engine time', async () => {
    const [t] = await run('seperate');
    expect(t.checkMs).toBeGreaterThanOrEqual(0);
    expect(t.suggestMs).toBeGreaterThanOrEqual(0);
  });
});
