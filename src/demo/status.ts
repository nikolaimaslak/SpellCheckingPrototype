import type { SpellServiceStatus } from '../spell/service';

const NAMES: Record<string, string> = { en: 'English', ar: 'Arabic' };
const name = (lang: string) => NAMES[lang] ?? lang;

export function renderStatus(el: HTMLElement, status: SpellServiceStatus): void {
  el.dataset.state = status.state;
  const parts = [
    ...status.loaded.map((l) => `${name(l.lang)} ✓ (${l.ms} ms)`),
    ...status.pending.map((lang) => `${name(lang)} loading…`),
    ...status.failed.map((f) => `${name(f.lang)} unavailable`),
  ];
  const label = { loading: 'loading', ready: 'ready', failed: 'failed' }[status.state];
  el.textContent = `Spelling engine: ${label}${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
  el.title = status.failed.map((f) => `${f.lang}: ${f.reason}`).join('\n');
}

/** Keeps the status element in sync with the spell service. */
export function trackStatus(
  el: HTMLElement,
  service: { status: SpellServiceStatus; onStatus(l: (s: SpellServiceStatus) => void): () => void },
): () => void {
  renderStatus(el, service.status);
  return service.onStatus((s) => renderStatus(el, s));
}
