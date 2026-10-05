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

  it('records the rule behind each replacement', async () => {
    const r = await byWord('teh paymnet oNly');
    expect([r.teh.replacement, r.teh.replacementSource]).toEqual(['the', 'list']);
    expect([r.paymnet.replacement, r.paymnet.replacementSource]).toEqual(['payment', 'neighbor']);
    expect([r.oNly.replacement, r.oNly.replacementSource]).toEqual(['only', 'case']);
  });

  it('puts a known misspelling first among the suggestions', async () => {
    const r = await byWord('الى');
    expect(r['الى'].suggestions[0]).toBe('إلى');
  });

  it('at list-only confidence replaces only known misspellings', async () => {
    const listOnly = await createPipeline({ customWords: ['GOSI', 'Absher'], autoReplace: 'list' });
    const tokens = (await listOnly.run('teh paymnet المستخذم')).tokens;
    expect(tokens.map((t) => [t.word, t.replacement])).toEqual([
      ['teh', 'the'],
      ['paymnet', null],
      ['المستخذم', null],
    ]);
  });

  it('leaves a capitalized name in mid-sentence, but fixes a typo that starts a sentence', async () => {
    const r = await byWord('Ms. Fatimah, I have sent you the form.');
    expect(r.Fatimah.flagged).toBe(true);
    expect(r.Fatimah.replacement).toBeNull();
    const s = await byWord('Thanks. Seperate forms are needed.');
    expect(s.Seperate.replacement).toBe('Separate');
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
    const r = await byWord('I will be there afte lunch');
    expect(r.afte.flagged).toBe(true);
    expect(r.afte.replacement).toBeNull();
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
    expect(transient).toEqual([{ word: 'seperate', lang: 'en', start: 5, end: 13, replacement: 'separate', replacementSource: 'list' }]);
  });

  it('measures engine time', async () => {
    const [t] = await run('paymnet');
    expect(t.checkMs).toBeGreaterThanOrEqual(0);
    expect(t.suggestMs).toBeGreaterThanOrEqual(0);
    expect(t.decideMs).toBeGreaterThanOrEqual(0);
  });
});
