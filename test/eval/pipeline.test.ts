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

  it('auto-replaces a clear Arabic slip, and only flags one with many neighbors', async () => {
    const r = await byWord('المستخذم النضام');
    expect(r['المستخذم'].replacement).toBe('المستخدم');
    expect(r['النضام'].flagged).toBe(true);
    expect(r['النضام'].suggestions[0]).toBe('النظام');
    expect(r['النضام'].replacement).toBeNull();
  });

  it('fixes only the case of a stray capital', async () => {
    const r = await byWord('oNly this');
    expect(r.oNly.replacement).toBe('only');
  });

  it('routes each word of a mixed message to its own language', async () => {
    const tokens = await run('رقم النضام هو paymnet');
    expect(tokens.map((t) => [t.word, t.lang, t.replacement])).toEqual([
      ['رقم', 'ar', null],
      ['النضام', 'ar', null],
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

  it('holds words completed by . @ : / until whitespace, as the composer does', async () => {
    // "gosi" is completed by a "." before the address is recognizable as an email (KI-2).
    for (const text of ['mail info@gosi.gov.sa today', 'You can also email us at info@gosi.gov.sa with your request.', 'visit https://www.gosi.gov.sa/en now']) {
      expect((await pipeline.run(text)).transient, text).toEqual([]);
    }
  });

  it('decides a held word at the space added after the message', async () => {
    const r = await byWord('Please seperate.');
    expect(r.seperate.replacement).toBe('separate');
  });

  it('records a replacement made while typing of a word the finished message does not have', async () => {
    // "-" is not held, so "seperate" is decided before the text becomes an address.
    const { tokens, transient } = await pipeline.run('mail seperate-x@gosi.gov.sa today');
    expect(tokens.map((t) => t.word)).toEqual(['mail', 'today']);
    expect(transient).toEqual([{ word: 'seperate', lang: 'en', start: 5, end: 13, replacement: 'separate' }]);
  });

  it('measures engine time', async () => {
    const [t] = await run('seperate');
    expect(t.checkMs).toBeGreaterThanOrEqual(0);
    expect(t.suggestMs).toBeGreaterThanOrEqual(0);
    expect(t.decideMs).toBeGreaterThanOrEqual(0);
  });
});
