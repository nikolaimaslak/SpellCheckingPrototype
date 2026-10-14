import { afterEach, describe, expect, it, vi } from 'vitest';
import { server, type CompletionRequest } from '../../src/assistant/server';

const body: CompletionRequest = {
  prefix: 'Thank you for contacting',
  transcript: [],
  sources: { transcript: true, canned: true, kb: true },
  canned: ['Thank you for contacting us.'],
  kb: [],
};
const reply = { completion: ' us.', lang: 'en', latencyMs: 5, model: 'fake', sources: [] };
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe('server', () => {
  it('posts completion requests to /api/v1/complete and returns the reply', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await server.complete(body, signal())).toEqual(reply);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/complete');
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it('posts polish requests to /api/v1/polish', async () => {
    const polished = { polished: 'He went.', changed: true, lang: 'en', latencyMs: 5, model: 'fake' };
    const f = vi.fn(async () => new Response(JSON.stringify(polished), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await server.polish('He go.', signal())).toEqual(polished);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/polish');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'He go.' });
  });

  it('resolves null on 503, network error and abort', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    expect(await server.complete(body, signal())).toBeNull();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    expect(await server.polish('x', signal())).toBeNull();
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, j) => init.signal!.addEventListener('abort', () => j(init.signal!.reason))));
    const ac = new AbortController();
    const p = server.complete(body, ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
});
