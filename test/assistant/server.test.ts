import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL, openAiServer, type CompletionRequest } from '../../src/assistant/server';

const body: CompletionRequest = {
  prefix: 'Thank you for contacting',
  transcript: [{ role: 'customer', text: 'Hi' }],
  canned: ['Thank you for contacting us.'],
  kb: [],
};
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 });
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe('openAiServer', () => {
  it('sends the key, model, draft and sources; keeps the first line of the answer', async () => {
    const f = vi.fn(async () => answer(' us today.\nSecond line'));
    vi.stubGlobal('fetch', f);
    expect(await openAiServer('sk-test').complete(body, signal())).toEqual({ completion: ' us today.' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(MODEL);
    expect(sent.messages[1].content).toContain('Customer: Hi');
    expect(sent.messages[1].content).toContain('- Thank you for contacting us.');
    expect(sent.messages[1].content).toMatch(/Thank you for contacting$/);
  });

  it('drops a leading space when the draft already ends with one', async () => {
    vi.stubGlobal('fetch', async () => answer(' us.'));
    expect(await openAiServer('k').complete({ ...body, prefix: 'Thank you for contacting ' }, signal())).toEqual({ completion: 'us.' });
  });

  it('polish reports whether the text changed', async () => {
    vi.stubGlobal('fetch', async () => answer('He went.'));
    expect(await openAiServer('k').polish('He go.', signal())).toEqual({ polished: 'He went.', changed: true });
    expect(await openAiServer('k').polish('He went.', signal())).toEqual({ polished: 'He went.', changed: false });
  });

  it('resolves null without a key, on 401, network error and abort', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await openAiServer('').complete(body, signal())).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    expect(await openAiServer('k').complete(body, signal())).toBeNull();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    expect(await openAiServer('k').polish('x', signal())).toBeNull();
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, j) => init.signal!.addEventListener('abort', () => j(init.signal!.reason))));
    const ac = new AbortController();
    const p = openAiServer('k').complete(body, ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
});
