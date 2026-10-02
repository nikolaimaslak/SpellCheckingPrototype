import { describe, expect, it } from 'vitest';
import { createFakeModel } from '../../server/models/fake';
import { cleanOutput, polish, POLISH_INSTRUCTION, safetyCheck } from '../../server/polish';
import type { CompletionModel } from '../../server/types';

const returning = (out: string): CompletionModel => ({ name: 'stub', complete: async () => out });
type Reply = { polished: string; changed: boolean; lang: string; reason?: string };

describe('POST /v1/polish', () => {
  it('returns English corrections from the model', async () => {
    const res = await polish({ text: 'He go to the office yesterday and buyed a pen.' }, { model: createFakeModel() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ polished: 'He went to the office yesterday and bought a pen.', changed: true, lang: 'en', model: 'fake' });
  });

  it('returns Arabic corrections', async () => {
    const res = await polish({ text: 'تم استلام هذه الطلب وسيتم معالجته.' }, { model: createFakeModel() });
    expect(res.body).toMatchObject({ polished: 'تم استلام هذا الطلب وسيتم معالجته.', changed: true, lang: 'ar' });
  });

  it('reports no change when the model returns the same text', async () => {
    const res = await polish({ text: 'Your request has been received.' }, { model: returning('Your request has been received.') });
    expect(res.body).toMatchObject({ changed: false });
    expect((res.body as Reply).reason).toBeUndefined();
  });

  it.each([
    ['a substitution field', 'Dear $(user.firstName), your request is ready.', 'Dear user, your request is ready.'],
    ['a URL', 'Visit https://example.org/a for details.', 'Visit https://example.org/b for details.'],
    ['a reference number', 'Your case CS-104233 is open.', 'Your case CS-104234 is open.'],
  ])('rejects a change to %s', async (_n, text, out) => {
    const res = await polish({ text }, { model: returning(out) });
    expect(res.body).toMatchObject({ polished: text, changed: false });
    expect((res.body as Reply).reason).toMatch(/protected/);
  });

  it('rejects rewrites that are too short or too long', async () => {
    const text = 'He go to the office yesterday and buyed a pen for the meeting.';
    expect(((await polish({ text }, { model: returning('He went.') })).body as Reply).reason).toMatch(/rewrite/);
    expect(((await polish({ text }, { model: returning(text + ' ' + text) })).body as Reply).reason).toMatch(/rewrite/);
  });

  it('keeps the draft\'s surrounding whitespace (email paragraphs end with a line break)', async () => {
    const res = await polish({ text: 'He go to the office.\n' }, { model: returning('He went to the office.') });
    expect(res.body).toMatchObject({ polished: 'He went to the office.\n', changed: true });
  });

  it('rejects a change in line breaks', async () => {
    const res = await polish({ text: 'Hello,\nhe go to the office.' }, { model: returning('Hello, he went to the office.') });
    expect((res.body as Reply).reason).toMatch(/line breaks/);
  });

  it('cleans fenced and quoted output', () => {
    expect(cleanOutput('```\nHe went home.\n```')).toBe('He went home.');
    expect(cleanOutput('"He went home."')).toBe('He went home.');
    expect(cleanOutput('He went\r\nhome.')).toBe('He went\nhome.');
  });

  it('rejects empty and oversized drafts, and answers 503 without a model', async () => {
    expect((await polish({ text: '  ' }, { model: createFakeModel() })).status).toBe(400);
    expect((await polish({ text: 'x'.repeat(4001) }, { model: createFakeModel() })).status).toBe(400);
    expect((await polish({ text: 'hello there' }, { model: null })).status).toBe(503);
  });

  it('maps model failures without leaking the key', async () => {
    const failing: CompletionModel = { name: 'x', complete: async () => { throw new Error('403 key=SECRET'); } };
    const res = await polish({ text: 'He go home.' }, { model: failing });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    const slow: CompletionModel = { name: 'x', complete: (_s, _u, signal) => new Promise((_r, j) => signal.addEventListener('abort', () => j(signal.reason))) };
    expect((await polish({ text: 'He go home.' }, { model: slow, timeoutMs: 20 })).status).toBe(504);
  });

  it('asks for grammar-only edits with protected content kept', () => {
    expect(POLISH_INSTRUCTION).toMatch(/Fix only errors/);
    expect(POLISH_INSTRUCTION).toMatch(/placeholder/);
    expect(safetyCheck('a b', 'a b')).toBeNull();
  });
});
