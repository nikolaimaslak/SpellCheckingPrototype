import { describe, expect, it, vi } from 'vitest';
import { createGeminiModel, GEMINI_MODEL } from '../../server/models/gemini';

const KEY = 'test-key-123';
const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe('Gemini client', () => {
  it('posts a generateContent request with the expected shape', async () => {
    const fetch = vi.fn(async () => ok(' will be processed.'));
    const model = createGeminiModel({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch });
    const text = await model.complete('SYS', 'USER', new AbortController().signal);
    expect(text).toBe(' will be processed.');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('SYS');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'USER' }] }]);
    expect(body.generationConfig).toMatchObject({ temperature: 0.2, maxOutputTokens: 48, stopSequences: ['\n'] });
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(url).not.toContain(KEY);
    expect(model.name).toBe('gemini-3.5-flash-lite');
  });

  it('returns empty text when there is no candidate', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const model = createGeminiModel({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await model.complete('s', 'u', new AbortController().signal)).toBe('');
  });

  it('throws without leaking the key or the response body', async () => {
    const fetch = vi.fn(async () => new Response(`bad key ${KEY}`, { status: 403 }));
    const model = createGeminiModel({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch });
    const err = await model.complete('s', 'u', new AbortController().signal).catch((e: Error) => e);
    expect((err as Error).message).toBe('Gemini request failed with HTTP 403');
    expect((err as Error).message).not.toContain(KEY);
  });

  it('passes the abort signal through', async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return ok('x');
    });
    await createGeminiModel({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch }).complete('s', 'u', new AbortController().signal);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('Gemini generation options', () => {
  it('overrides output limits and stop sequences per request, keeping defaults otherwise', async () => {
    const fetch = vi.fn(async () => ok('x'));
    const model = createGeminiModel({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch });
    await model.complete('s', 'u', new AbortController().signal, { maxOutputTokens: 512, stopSequences: [] });
    await model.complete('s', 'u', new AbortController().signal);
    const [withOpts, defaults] = fetch.mock.calls.map((c) => JSON.parse(((c as unknown as [string, RequestInit])[1].body as string)).generationConfig);
    expect(withOpts).toMatchObject({ maxOutputTokens: 512, stopSequences: [], temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } });
    expect(defaults).toMatchObject({ maxOutputTokens: 48, stopSequences: ['\n'] });
  });
});
