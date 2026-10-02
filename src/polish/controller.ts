import { buildTextMap } from '../tokenizer';
import { applyPolish, revertSpans } from './apply';
import type { PolishFetcher } from './client';
import { diff } from './diff';
import { createPolishButton, openPolishPanel, showRevertToast, type PolishPanel } from './ui';

export interface PolishEvent {
  type: 'polish-shown' | 'polish-accepted' | 'polish-dismissed' | 'polish-reverted';
  lang: 'en' | 'ar';
  latencyMs?: number;
  changes?: number;
}

export interface PolishOptions {
  fetcher: PolishFetcher;
  /** Events without any draft or corrected text. */
  onEvent?: (event: PolishEvent) => void;
  /** Called when the agent presses Polish, e.g. to dismiss completion ghost text. */
  onOpen?: () => void;
  env?: { replace?: (range: Range, text: string) => void };
  minWords?: number;
}

export interface PolishHandle {
  detach(): void;
  /** Same as pressing the button (tests, demos). */
  polishNow(): Promise<void>;
}

const langOf = (t: string): 'en' | 'ar' =>
  (t.match(/\p{Script=Arabic}/gu) ?? []).length > (t.match(/\p{Script=Latin}/gu) ?? []).length ? 'ar' : 'en';

/** On-demand grammar and spelling polish: button → preview → accept or dismiss. */
export function attachPolish(el: HTMLElement, options: PolishOptions): PolishHandle {
  const { fetcher, minWords = 3 } = options;
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const emit = (e: PolishEvent) => options.onEvent?.(e);
  const replace =
    options.env?.replace ??
    ((range: Range, text: string) => {
      el.focus();
      const sel = doc.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      doc.execCommand('insertText', false, text);
    });

  let panel: PolishPanel | undefined;
  let toast: { remove(): void } | undefined;
  let inFlight: AbortController | undefined;
  let detached = false;

  const button = createPolishButton(el, () => void polishNow());
  const syncButton = () => {
    const words = buildTextMap(el).text.match(/[\p{L}\p{N}]+/gu) ?? [];
    button.setEnabled(words.length >= minWords);
    button.reposition();
  };

  async function polishNow(): Promise<void> {
    if (detached || inFlight || doc.querySelector('[data-bp-spell-popover]')) return;
    const sent = buildTextMap(el).text;
    if ((sent.match(/[\p{L}\p{N}]+/gu) ?? []).length < minWords) return;
    options.onOpen?.();
    panel?.close();
    toast?.remove();
    const lang = langOf(sent);
    const ac = new AbortController();
    inFlight = ac;
    button.setBusy(true);
    const started = performance.now();
    const reply = await fetcher(sent, ac.signal);
    inFlight = undefined;
    button.setBusy(false);
    if (detached || ac.signal.aborted) return;
    const latencyMs = Math.round(performance.now() - started);
    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    if (!reply) {
      panel = openPolishPanel({ composer: el, dir, segments: [], message: 'Polishing is unavailable right now.', onDismiss: () => (panel = undefined) });
      return;
    }
    const { hunks, segments } = reply.changed ? diff(sent, reply.polished) : { hunks: [], segments: [] };
    emit({ type: 'polish-shown', lang, latencyMs, changes: hunks.length });
    if (!hunks.length) {
      panel = openPolishPanel({ composer: el, dir, segments: [], message: 'No changes suggested.', onDismiss: () => (panel = undefined) });
      return;
    }
    panel = openPolishPanel({
      composer: el,
      dir,
      segments,
      onDismiss: () => {
        panel = undefined;
        emit({ type: 'polish-dismissed', lang });
      },
      onAccept: () => {
        const res = applyPolish(el, sent, hunks, replace);
        if (!res.ok) {
          panel?.showMessage('The draft changed after you pressed Polish. Polish again to get fresh suggestions.');
          return;
        }
        panel?.close();
        panel = undefined;
        emit({ type: 'polish-accepted', lang, changes: hunks.length });
        if (res.mode === 'per-span') {
          toast = showRevertToast(el, () => {
            revertSpans(res.spans, replace);
            emit({ type: 'polish-reverted', lang });
          });
        }
      },
    });
  }

  const observer = new MutationObserver(syncButton);
  observer.observe(el, { characterData: true, childList: true, subtree: true });
  el.addEventListener('input', syncButton);
  win.addEventListener('resize', syncButton);
  win.addEventListener('scroll', syncButton, true);
  syncButton();

  return {
    polishNow,
    detach() {
      if (detached) return;
      detached = true;
      inFlight?.abort();
      observer.disconnect();
      el.removeEventListener('input', syncButton);
      win.removeEventListener('resize', syncButton);
      win.removeEventListener('scroll', syncButton, true);
      button.remove();
      panel?.close();
      toast?.remove();
    },
  };
}
