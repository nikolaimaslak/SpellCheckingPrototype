import type { LoadResult } from '../spell/protocol';

export type EngineStatus =
  | { state: 'loading' }
  | { state: 'ready'; result: LoadResult }
  | { state: 'failed'; reason: string };

const NAMES: Record<string, string> = { en: 'English', ar: 'Arabic' };

export function renderStatus(el: HTMLElement, status: EngineStatus): void {
  el.dataset.state = status.state;
  switch (status.state) {
    case 'loading':
      el.textContent = 'Spelling engine: loading…';
      return;
    case 'failed':
      el.textContent = `Spelling engine: failed — ${status.reason}`;
      return;
    case 'ready': {
      const loaded = status.result.loaded.map((l) => `${NAMES[l.lang] ?? l.lang} ✓ (${l.ms} ms)`);
      const failed = status.result.failed.map((f) => `${NAMES[f.lang] ?? f.lang} unavailable`);
      el.textContent = `Spelling engine: ready — ${[...loaded, ...failed].join(' · ')}`;
      el.title = status.result.failed.map((f) => `${f.lang}: ${f.reason}`).join('\n');
    }
  }
}

/** Loads the given languages and reflects progress in the status element. */
export async function trackStatus(
  el: HTMLElement,
  load: () => Promise<LoadResult>,
): Promise<void> {
  renderStatus(el, { state: 'loading' });
  try {
    const result = await load();
    renderStatus(el, result.loaded.length ? { state: 'ready', result } : { state: 'failed', reason: 'no dictionaries loaded' });
  } catch (err) {
    renderStatus(el, { state: 'failed', reason: (err as Error).message });
  }
}
