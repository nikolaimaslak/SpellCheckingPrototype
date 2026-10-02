// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderStatus, trackStatus } from '../../src/demo/status';
import type { SpellServiceStatus } from '../../src/spell/service';

describe('engine status indicator', () => {
  it('shows staged readiness: English usable while Arabic loads', () => {
    const el = document.createElement('p');
    renderStatus(el, { state: 'ready', loaded: [{ lang: 'en', ms: 42 }], failed: [], pending: ['ar'] });
    expect(el.dataset.state).toBe('ready');
    expect(el.textContent).toBe('Spelling engine: ready — English ✓ (42 ms) · Arabic loading…');
  });

  it('shows English loaded and Arabic unavailable with the reason in the tooltip', () => {
    const el = document.createElement('p');
    renderStatus(el, {
      state: 'ready',
      loaded: [{ lang: 'en', ms: 42 }],
      failed: [{ lang: 'ar', reason: 'dictionary not found: /dicts/ar/ar.aff (HTTP 404)' }],
      pending: [],
    });
    expect(el.textContent).toBe('Spelling engine: ready — English ✓ (42 ms) · Arabic unavailable');
    expect(el.title).toContain('HTTP 404');
  });

  it('shows failed when nothing loads', () => {
    const el = document.createElement('p');
    renderStatus(el, { state: 'failed', loaded: [], failed: [{ lang: 'en', reason: 'x' }], pending: [] });
    expect(el.dataset.state).toBe('failed');
  });

  it('follows service updates', () => {
    const el = document.createElement('p');
    let push!: (s: SpellServiceStatus) => void;
    trackStatus(el, {
      status: { state: 'loading', loaded: [], failed: [], pending: ['en', 'ar'] },
      onStatus: (l) => ((push = l), () => {}),
    });
    expect(el.textContent).toBe('Spelling engine: loading — English loading… · Arabic loading…');
    push({ state: 'ready', loaded: [{ lang: 'en', ms: 5 }, { lang: 'ar', ms: 900 }], failed: [], pending: [] });
    expect(el.textContent).toBe('Spelling engine: ready — English ✓ (5 ms) · Arabic ✓ (900 ms)');
  });
});
