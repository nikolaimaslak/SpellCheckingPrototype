import { describe, expect, it, vi } from 'vitest';
import { createCompletionClient } from '../../src/completion/client';

const body = { prefix: 'Thank you for contacting', transcript: [], sources: { transcript: true, canned: true, kb: true } };
const reply = { completion: ' us.', lang: 'en', latencyMs: 5, model: 'fake', sources: [] };

describe('completion client', () => {
  it('posts to {base}/v1/complete and returns the reply', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 }));
    const get = createCompletionClient('/api/', 2500, f as unknown as typeof fetch);
    expect(await get(body, new AbortController().signal)).toEqual(reply);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/complete');
  });

  it('resolves null on 503, network error, abort and timeout', async () => {
    const e503 = createCompletionClient('/api', 2500, (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch);
    expect(await e503(body, new AbortController().signal)).toBeNull();
    const down = createCompletionClient('/api', 2500, (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    expect(await down(body, new AbortController().signal)).toBeNull();
    const hang = (async (_u: string, init: RequestInit) =>
      new Promise((_r, j) => init.signal!.addEventListener('abort', () => j(init.signal!.reason)))) as unknown as typeof fetch;
    const ac = new AbortController();
    const p = createCompletionClient('/api', 2500, hang)(body, ac.signal);
    ac.abort();
    expect(await p).toBeNull();
    expect(await createCompletionClient('/api', 20, hang)(body, new AbortController().signal)).toBeNull();
  });
});
