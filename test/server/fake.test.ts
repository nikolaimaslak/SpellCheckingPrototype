import { describe, expect, it } from 'vitest';
import { createFakeModel } from '../../server/models/fake';
import { buildUserContent, COMPLETION_SCHEMA } from '../../server/prompt';

const RECEIVED = { id: 'en-request-processing', lang: 'en' as const, text: 'Your request has been received and will be processed within 3 working days.' };
const ask = (prefix: string) =>
  createFakeModel().complete('You complete the unfinished sentence…', buildUserContent(prefix, null, [RECEIVED]), new AbortController().signal, { responseSchema: COMPLETION_SCHEMA }).then((t) => JSON.parse(t));

describe('offline model, structured completion', () => {
  it('answers the whole current word and the rest', async () => {
    expect(await ask('Thank you, your request')).toEqual({ word: 'request', rest: ' has been received and will be processed within 3 working days.' });
    expect(await ask("It hasn't been proce")).toEqual({ word: 'processed', rest: ' within 3 working days.' });
  });

  it('answers an empty word after a space or punctuation', async () => {
    expect(await ask('Thank you, your request ')).toEqual({ word: '', rest: 'has been received and will be processed within 3 working days.' });
    expect(await ask('Thank you, your request,')).toMatchObject({ word: '', rest: ' has been received and will be processed within 3 working days.' });
  });

  it('completes an Arabic unfinished word', async () => {
    const ar = { id: 'ar', lang: 'ar' as const, text: 'تم استلام طلبك وسيتم معالجته.' };
    const out = await createFakeModel().complete('s', buildUserContent('شكراً، تم استلا', null, [ar]), new AbortController().signal, { responseSchema: COMPLETION_SCHEMA });
    expect(JSON.parse(out)).toEqual({ word: 'استلام', rest: ' طلبك وسيتم معالجته.' });
  });

  it('keeps polish as plain text', async () => {
    expect(await createFakeModel().complete('You correct grammar…', 'He go home.', new AbortController().signal)).toBe('He went home.');
  });
});
