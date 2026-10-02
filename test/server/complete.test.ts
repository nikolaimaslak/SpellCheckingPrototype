import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
    const res = await complete(body, { model: createFakeModel(), library });
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
      { model: createFakeModel(), library, kb },
    );
    expect((res.body as { completion: string }).completion).toMatch(/available to members/);
  });
});
