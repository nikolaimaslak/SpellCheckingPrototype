// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fetchModelState, renderBrowserNotice, renderModelBanner, renderVersion } from '../../src/demo/model-banner';

const health = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('model banner', () => {
  it('maps health reports to banner states', async () => {
    expect(await fetchModelState('/x', health({ ok: true, model: 'gemini-3.5-flash-lite', external: true }))).toEqual({ state: 'gemini', model: 'gemini-3.5-flash-lite' });
    expect(await fetchModelState('/x', health({ ok: true, model: 'fake', external: false }))).toEqual({ state: 'offline' });
    expect(await fetchModelState('/x', health({ ok: true, model: null, external: false }))).toEqual({ state: 'unavailable' });
    expect(await fetchModelState('/x', health({ ok: true, model: 'ollama_chat/qwen3:8b', external: false }))).toEqual({ state: 'local', model: 'ollama_chat/qwen3:8b' });
    expect(await fetchModelState('/x', health({ ok: true, model: 'hosted_vllm/m', external: true }))).toEqual({ state: 'external', model: 'hosted_vllm/m' });
    expect(await fetchModelState('/x', health({ ok: true, model: 'gemini/gemini-3.5-flash', external: true }))).toEqual({ state: 'gemini', model: 'gemini/gemini-3.5-flash' });
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
    renderModelBanner(el, { state: 'external', model: 'hosted_vllm/m' });
    expect(el.classList.contains('warn')).toBe(true);
    expect(el.textContent).toMatch(/hosted_vllm\/m: .*sent outside this machine.*made-up text only/);
    expect(el.textContent).not.toMatch(/Google/);
    renderModelBanner(el, { state: 'local', model: 'ollama_chat/qwen3:8b' });
    expect(el.classList.contains('ok')).toBe(true);
    expect(el.textContent).toMatch(/ollama_chat\/qwen3:8b, a model running on this machine: nothing you type leaves it/);
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
