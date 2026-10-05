import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { complete } from '../../server/complete';
import { createFakeModel } from '../../server/models/fake';
import type { CannedResponse, CompletionModel } from '../../server/types';

const library = (JSON.parse(readFileSync('server/data/canned.json', 'utf8')) as { responses: CannedResponse[] }).responses;
const body = {
  prefix: 'Thank you for contacting us, your request',
  transcript: [{ role: 'customer', text: 'I submitted a request for my documents, when will it be processed?' }],
  sources: { transcript: true, canned: true },
};

describe('POST /v1/complete', () => {
  it('replies with a completion, language, latency, model and sources', async () => {
    const res = await complete(body, { model: createFakeModel(), library, allowSourcedFigures: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lang: 'en', model: 'fake' });
    const reply = res.body as { completion: string; sources: string[]; latencyMs: number };
    expect(reply.completion.startsWith(' has been received')).toBe(true);
    expect(reply.sources[0]).toBe('en-request-processing');
    expect(reply.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('retrieves nothing when canned responses are disabled', async () => {
    let seen = '';
    const spy: CompletionModel = { name: 'spy', complete: async (_s, user) => ((seen = user), ' will be processed.') };
    const res = await complete({ ...body, sources: { transcript: true, canned: false } }, { model: spy, library });
    expect((res.body as { sources: string[] }).sources).toEqual([]);
    expect(seen).not.toContain('Approved responses');
    expect(seen).toContain('Conversation:');
  });

  it('returns an empty completion when post-processing rejects the output', async () => {
    const english: CompletionModel = { name: 'x', complete: async () => 'will be processed.' };
    const res = await complete({ ...body, prefix: 'تم استلام طلبك' }, { model: english, library });
    expect(res.status).toBe(200);
    expect((res.body as { completion: string }).completion).toBe('');
  });

  it('answers 503 without a model', async () => {
    const res = await complete(body, { model: null, library });
    expect(res).toEqual({ status: 503, body: { error: expect.stringMatching(/unavailable/) } });
  });

  it('answers 502 on model failure without leaking details', async () => {
    const failing: CompletionModel = { name: 'x', complete: async () => { throw new Error('401 key=SECRET'); } };
    const res = await complete(body, { model: failing, library });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  it('answers 504 on timeout', async () => {
    const res = await complete(body, { model: createFakeModel(500), library, timeoutMs: 20 });
    expect(res.status).toBe(504);
  });

  it('rejects a missing prefix', async () => {
    expect((await complete({ transcript: [] }, { model: createFakeModel(), library })).status).toBe(400);
  });
});

import { kbPassages, type KbArticle } from '../../server/retrieval';
const kb = kbPassages((JSON.parse(readFileSync('server/data/kb.json', 'utf8')) as { articles: KbArticle[] }).articles);

describe('knowledge base grounding', () => {
  const spyModel = () => {
    const seen: string[] = [];
    const model: CompletionModel = { name: 'spy', complete: async (_s, user) => (seen.push(user), ' will be reviewed within 10 working days.') };
    return { seen, model };
  };
  const ask = (customer: string, kbOn = true) => ({
    prefix: 'Your early retirement application',
    transcript: [{ role: 'customer', text: customer }],
    sources: { transcript: true, canned: true, kb: kbOn },
  });

  it('adds passages and lists kb ids on a strong match', async () => {
    const { seen, model } = spyModel();
    const res = await complete(ask('Am I eligible for early retirement? I have 26 years of contributions.'), { model, library, kb });
    expect((res.body as { sources: string[] }).sources.some((s) => s.startsWith('kb:en-early-retirement'))).toBe(true);
    expect(seen[0]).toContain('Knowledge base:');
  });

  it('adds nothing on a weak match', async () => {
    const { seen, model } = spyModel();
    const res = await complete(ask('Hello, good morning'), { model, library, kb });
    expect((res.body as { sources: string[] }).sources.some((s) => s.startsWith('kb:'))).toBe(false);
    expect(seen[0]).not.toContain('Knowledge base:');
  });

  it('adds nothing when the kb source is off', async () => {
    const { seen, model } = spyModel();
    await complete(ask('Am I eligible for early retirement? I have 26 years of contributions.', false), { model, library, kb });
    expect(seen[0]).not.toContain('Knowledge base:');
  });

  it('the fake model falls back to a knowledge base passage when no canned response matches', async () => {
    const res = await complete(
      { prefix: 'Early retirement is', transcript: [{ role: 'customer', text: 'Am I eligible for early retirement? I have 26 years of contributions.' }], sources: { transcript: true, canned: false, kb: true } },
      { model: createFakeModel(), library, kb, allowSourcedFigures: true },
    );
    expect((res.body as { completion: string }).completion).toMatch(/available to members/);
  });
});

describe('safety filter (Req 3.7)', () => {
  const fixed = (text: string): CompletionModel => ({ name: 'fixed', complete: async () => text });

  it('withholds the canned "3 working days" completion under the default, and reports only the reason', async () => {
    const seen: unknown[][] = [];
    const res = await complete(body, { model: createFakeModel(), library, onWithheld: (...a) => seen.push(a) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ completion: '', withheld: 'figure', lang: 'en' });
    expect(seen).toEqual([['figure', 'en']]);
  });

  it('returns the sourced completion with allowSourcedFigures', async () => {
    const res = await complete(body, { model: createFakeModel(), library, allowSourcedFigures: true });
    expect((res.body as { completion: string; withheld?: string }).completion).toMatch(/within 3 working days/);
    expect(res.body).not.toHaveProperty('withheld');
  });

  it('passes a clean completion without a reason', async () => {
    const onWithheld = vi.fn();
    const res = await complete(body, { model: fixed(' has been received and is being reviewed.'), library, onWithheld });
    expect(res.body).toMatchObject({ completion: ' has been received and is being reviewed.' });
    expect(res.body).not.toHaveProperty('withheld');
    expect(onWithheld).not.toHaveBeenCalled();
  });

  it('withholds a name from the conversation even with allowSourcedFigures', async () => {
    const res = await complete(
      { ...body, transcript: [{ role: 'customer', text: 'Hello, this is Noura. When will my request be processed?' }] },
      { model: fixed(' Noura, it is being reviewed.'), library, allowSourcedFigures: true },
    );
    expect(res.body).toMatchObject({ completion: '', withheld: 'conversation' });
  });

  it('never passes completion text to onWithheld', async () => {
    const seen: unknown[][] = [];
    await complete(body, { model: fixed(' will be ready next week.'), library, onWithheld: (...a) => seen.push(a) });
    expect(JSON.stringify(seen)).toBe('[["date","en"]]');
  });
});

describe('tester guide scenarios with the offline model (docs/TESTING.md T4)', () => {
  const kbAll = kb;
  const ask = (prefix: string, turns: string[], allowSourcedFigures: boolean) =>
    complete(
      { prefix, transcript: turns.map((text) => ({ role: 'customer' as const, text })), sources: { transcript: true, canned: true, kb: true } },
      { model: createFakeModel(), library, kb: kbAll, allowSourcedFigures },
    ).then((r) => r.body as { completion: string; withheld?: string });
  const EN = ['Hello, I submitted a request for my pension documents last week. When will it be processed?', 'Also, can you check the status of my contribution records?'];
  const AR = ['السلام عليكم، قدمت طلباً للحصول على مستندات المعاش الأسبوع الماضي، متى سيتم معالجته؟', 'هل يمكنك أيضاً الاستعلام عن الاشتراكات الخاصة بي؟'];

  it('T4.2 and T4.7: the contribution-records suggestions pass under the default', async () => {
    expect((await ask('Thank you for waiting, your contribution records', EN, false)).completion).toMatch(/^ are up to date/);
    expect((await ask('شكراً لانتظارك، سجل الاشتراكات الخاص بك', AR, false)).completion).toMatch(/محدث/);
  });

  it('T4.14: the "3 working days" suggestion is withheld under the default', async () => {
    expect(await ask('Thank you for contacting us, your request', EN.slice(0, 1), false)).toMatchObject({ completion: '', withheld: 'figure' });
    expect(await ask('شكراً لتواصلك معنا، تم استلام طلبك', AR.slice(0, 1), false)).toMatchObject({ completion: '', withheld: 'figure' });
  });

  it('T4.15: it appears with allow', async () => {
    expect((await ask('Thank you for contacting us, your request', EN.slice(0, 1), true)).completion).toMatch(/within 3 working days/);
  });
});

describe('unfinished words (completion-midword-join)', () => {
  const fixed = (text: string): CompletionModel => ({ name: 'fixed', complete: async () => text });
  const FIRST = [{ role: 'customer' as const, text: 'Hello, I submitted a request for my pension documents last week. When will it be processed?' }];
  const midword = (allowSourcedFigures: boolean) =>
    complete({ prefix: "It hasn't been proce", transcript: FIRST, sources: { transcript: true, canned: true, kb: true } }, { model: createFakeModel(), library, kb, allowSourcedFigures });

  it('completes the word with no leading space, with the offline model', async () => {
    const body = (await midword(true)).body as { completion: string };
    expect(body.completion).toMatch(/^ssed within 3 working days/);
  });

  it('withholds the same completion under the default (figure)', async () => {
    expect((await midword(false)).body).toMatchObject({ completion: '', withheld: 'figure' });
  });

  it('still adds the space after a whole word', async () => {
    const res = await complete(body, { model: fixed('has been received and is being reviewed.'), library });
    expect((res.body as { completion: string }).completion).toBe(' has been received and is being reviewed.');
  });

  it('does not count the unfinished word itself as known', async () => {
    const res = await complete({ ...body, prefix: 'Please use the Abshe' }, { model: fixed('r app now.'), library });
    expect((res.body as { completion: string }).completion).toBe('r app now.');
  });

  it('is not tripped by the conversation-word check on a mid-word fragment', async () => {
    const res = await complete(
      { prefix: "It hasn't been proce", transcript: FIRST, sources: { transcript: true, canned: false, kb: false } },
      { model: fixed('ssed yet, but it is under review.'), library },
    );
    expect(res.body).toMatchObject({ completion: 'ssed yet, but it is under review.' });
    expect(res.body).not.toHaveProperty('withheld');
  });
});

describe('tester guide mid-word scenario (docs/TESTING.md T4.17)', () => {
  it('"Your contribution rec" completes to "ords are up to date…" under the default setting', async () => {
    const res = await complete(
      {
        prefix: 'Your contribution rec',
        transcript: [
          { role: 'customer', text: 'Hello, I submitted a request for my pension documents last week. When will it be processed?' },
          { role: 'customer', text: 'Also, can you check the status of my contribution records?' },
        ],
        sources: { transcript: true, canned: true, kb: true },
      },
      { model: createFakeModel(), library, kb },
    );
    expect((res.body as { completion: string }).completion).toBe('ords are up to date, and the latest payment has been registered on your account.');
  });
});

