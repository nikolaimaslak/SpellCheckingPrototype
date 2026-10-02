// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../../src/telemetry';

afterEach(() => vi.useRealTimers());

describe('telemetry client', () => {
  it('batches events into one POST per interval', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response('{}'));
    const t = createTelemetry({ url: '/api/v1/events', session: 's1', flushMs: 5000, fetch: fetch as unknown as typeof globalThis.fetch });
    t.record({ type: 'autocorrect', lang: 'en', original: 'seperate', replacement: 'separate' });
    t.record({ type: 'completion-shown', lang: 'ar', latencyMs: 300, shownLength: 20 });
    t.record({ type: 'revert', lang: 'en' });
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/events');
    const sent = JSON.parse(init.body as string);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatchObject({ type: 'autocorrect', session: 's1', ts: expect.any(Number) });
    vi.advanceTimersByTime(5000);
    expect(fetch).toHaveBeenCalledTimes(1); // nothing new, nothing sent
    t.stop();
  });

  it('never throws when the endpoint fails', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('down'); });
    const t = createTelemetry({ url: '/x', session: 's', fetch: fetch as unknown as typeof globalThis.fetch });
    t.record({ type: 'accept' });
    expect(() => t.flush()).not.toThrow();
    await Promise.resolve();
    t.stop();
  });

  it('sends a beacon when the page is hidden', () => {
    const sendBeacon = vi.fn(() => true);
    const t = createTelemetry({ url: '/x', session: 's', sendBeacon, fetch: vi.fn() as unknown as typeof fetch });
    t.record({ type: 'ignore', lang: 'en' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(JSON.parse((sendBeacon.mock.calls[0] as unknown as [string, string])[1])[0].type).toBe('ignore');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    t.stop();
  });
});
