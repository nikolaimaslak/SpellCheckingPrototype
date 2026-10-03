export type ModelState =
  | { state: 'gemini'; model: string }
  | { state: 'offline' }
  | { state: 'unavailable' };

/** Reads the completion service's health report; any failure means unavailable. */
export async function fetchModelState(url = '/api/health', doFetch: typeof fetch = (...a) => fetch(...a)): Promise<ModelState> {
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { state: 'unavailable' };
    const h = (await res.json()) as { model: string | null; external?: boolean };
    if (!h.model) return { state: 'unavailable' };
    return h.external ? { state: 'gemini', model: h.model } : { state: 'offline' };
  } catch {
    return { state: 'unavailable' };
  }
}

export function renderModelBanner(el: HTMLElement, s: ModelState): void {
  el.dataset.state = s.state;
  el.classList.toggle('warn', s.state === 'gemini');
  el.classList.toggle('ok', s.state === 'offline');
  el.classList.toggle('off', s.state === 'unavailable');
  el.textContent =
    s.state === 'gemini'
      ? `Completion and polish use ${s.model} (Google): everything you type in a composer may be sent to Google. Use made-up text only.`
      : s.state === 'offline'
        ? 'Completion and polish use the offline test model: they show canned results, and nothing leaves this machine.'
        : 'Completion and polish are unavailable (completion server not running or no model). Spell checking and auto-correct still work offline.';
}

/** Spelling underlines and auto-correct highlights need the CSS Custom Highlight API. */
export function renderBrowserNotice(el: HTMLElement, supported: boolean): void {
  el.hidden = supported;
  el.textContent = supported
    ? ''
    : 'This browser cannot draw spelling underlines (no CSS Custom Highlight API). Use current Chrome or Edge, Safari 17.2+, or Firefox 140+.';
}

export const highlightsSupported = () => typeof CSS !== 'undefined' && 'highlights' in CSS;

/** "v0.1.0 · 3abdde6": testers quote this in reports. */
export function renderVersion(el: HTMLElement, version: string): void {
  el.textContent = `v${version}`;
}
