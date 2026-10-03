// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fetchModelState, renderBrowserNotice, renderModelBanner, renderVersion } from '../../src/demo/model-banner';

const health = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('model banner', () => {
  it('maps health reports to banner states', async () => {
    expect(await fetchModelState('/x', health({ ok: true, model: 'gemini-3.5-flash-lite', external: true }))).toEqual({ state: 'gemini', model: 'gemini-3.5-flash-lite' });
    expect(await fetchModelState('/x', health({ ok: true, model: 'fake', external: false }))).toEqual({ state: 'offline' });
    expect(await fetchModelState('/x', health({ ok: true, model: null, external: false }))).toEqual({ state: 'unavailable' });
    expect(await fetchModelState('/x', health({}, 502))).toEqual({ state: 'unavailable' });
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await fetchModelState('/x', down)).toEqual({ state: 'unavailable' });
  });

  it('renders a prominent Google warning for Gemini, and plain notes otherwise', () => {
    const el = document.createElement('div');
    renderModelBanner(el, { state: 'gemini', model: 'gemini-3.5-flash-lite' });
    expect(el.classList.contains('warn')).toBe(true);
    expect(el.textContent).toMatch(/sent to Google.*made-up text only/);
    renderModelBanner(el, { state: 'offline' });
    expect(el.classList.contains('warn')).toBe(false);
    expect(el.textContent).toMatch(/offline test model.*canned/);
    renderModelBanner(el, { state: 'unavailable' });
    expect(el.textContent).toMatch(/unavailable.*Spell checking and auto-correct still work/);
  });

  it('shows the browser notice only when highlights are unsupported', () => {
    const el = document.createElement('div');
    renderBrowserNotice(el, false);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toMatch(/Chrome or Edge, Safari 17\.2\+, or Firefox 140\+/);
    renderBrowserNotice(el, true);
    expect(el.hidden).toBe(true);
  });

  it('renders the version stamp', () => {
    const el = document.createElement('span');
    renderVersion(el, '0.1.0 · 3abdde6');
    expect(el.textContent).toBe('v0.1.0 · 3abdde6');
  });
});
