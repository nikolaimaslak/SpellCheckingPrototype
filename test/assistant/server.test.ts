import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL, openAiServer, type CheckRequest } from '../../src/assistant/server';

const body: CheckRequest = {
  text: 'Thank you for contacting',
  prefix: 'Thank you for contacting',
  transcript: [{ role: 'customer', text: 'Hi' }],
  canned: ['Thank you for contacting us.'],
  kb: [],
  customWords: ['GOSI'],
};
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 });
const json = (value: unknown) => answer(JSON.stringify(value));
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe('openAiServer.check', () => {
  it('sends the key, model, draft and sources as a JSON request', async () => {
    const f = vi.fn(async () => json({ mistakes: [], completion: ' us today.' }));
    vi.stubGlobal('fetch', f);
    expect(await openAiServer('sk-test').check(body, signal())).toEqual({ mistakes: [], completion: ' us today.' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(MODEL);
    expect(sent.response_format).toEqual({ type: 'json_object' });
    const user = sent.messages[1].content as string;
    expect(user).toContain('Customer: Hi');
    expect(user).toContain('- Thank you for contacting us.');
    expect(user).toContain('- GOSI');
    expect(user).toMatch(/Continue after:\nThank you for contacting$/);
  });

  it('keeps well-formed mistakes only', async () => {
    vi.stubGlobal('fetch', async () =>
      json({
        mistakes: [
          { word: 'paymnet', fixes: ['payment'], sure: true },
          { word: 'afte', fixes: ['after', 'aft'] },
          { word: 'same', fixes: ['same'] },
          { word: 42, fixes: ['x'] },
          'junk',
        ],
        completion: 7,
      }),
    );
    expect(await openAiServer('k').check({ ...body, prefix: null }, signal())).toEqual({
      mistakes: [
        { word: 'paymnet', fixes: ['payment'], sure: true },
        { word: 'afte', fixes: ['after', 'aft'], sure: false },
      ],
      completion: '',
    });
  });

  it('asks for no completion without a prefix, and ignores one it gets', async () => {
    const f = vi.fn(async () => json({ mistakes: [], completion: ' anyway' }));
    vi.stubGlobal('fetch', f);
    expect(await openAiServer('k').check({ ...body, prefix: null }, signal())).toEqual({ mistakes: [], completion: '' });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[1].content).not.toContain('Continue after');
  });

  it('keeps the first line, and drops a leading space after a space', async () => {
    vi.stubGlobal('fetch', async () => json({ mistakes: [], completion: ' us.\nSecond line' }));
    expect((await openAiServer('k').check({ ...body, prefix: 'Thank you for contacting ' }, signal()))?.completion).toBe('us.');
  });

  it('resolves null without a key, on 401, unreadable JSON, network error and abort', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await openAiServer('').check(body, signal())).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    expect(await openAiServer('k').check(body, signal())).toBeNull();
    vi.stubGlobal('fetch', async () => answer('not json'));
    expect(await openAiServer('k').check(body, signal())).toBeNull();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    expect(await openAiServer('k').polish('x', signal())).toBeNull();
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, j) => init.signal!.addEventListener('abort', () => j(init.signal!.reason))));
    const ac = new AbortController();
    const p = openAiServer('k').check(body, ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
});

describe('openAiServer.polish', () => {
  it('reports whether the text changed', async () => {
    vi.stubGlobal('fetch', async () => answer('He went.'));
    expect(await openAiServer('k').polish('He go.', signal())).toEqual({ polished: 'He went.', changed: true });
    expect(await openAiServer('k').polish('He went.', signal())).toEqual({ polished: 'He went.', changed: false });
  });
});
