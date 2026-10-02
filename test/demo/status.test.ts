// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { trackStatus } from '../../src/demo/status';

describe('engine status indicator', () => {
  it('shows English loaded and Arabic unavailable', async () => {
    const el = document.createElement('p');
    await trackStatus(el, async () => ({
      loaded: [{ lang: 'en', ms: 42 }],
      failed: [{ lang: 'ar', reason: 'dictionary not found: /dicts/ar/ar.aff (HTTP 404)' }],
    }));
    expect(el.dataset.state).toBe('ready');
    expect(el.textContent).toBe('Spelling engine: ready — English ✓ (42 ms) · Arabic unavailable');
    expect(el.title).toContain('HTTP 404');
  });

  it('shows loading while the worker is busy', () => {
    const el = document.createElement('p');
    void trackStatus(el, () => new Promise(() => {}));
    expect(el.dataset.state).toBe('loading');
  });

  it('shows failed when nothing loads', async () => {
    const el = document.createElement('p');
    await trackStatus(el, async () => ({ loaded: [], failed: [{ lang: 'en', reason: 'x' }] }));
    expect(el.dataset.state).toBe('failed');
  });
});
