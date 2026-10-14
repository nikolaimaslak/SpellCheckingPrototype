import { buildTextMap } from '../tokenizer';
import { applyPolish, revertSpans, type AppliedSpan } from './polish-apply';
import { diff, type Hunk } from './polish-diff';
import type { Server } from './server';
import type { PolishState, Shared } from './state';

export interface PolishOptions {
  server: Server;
  /** Called when Polish is pressed (hides the completion ghost text). */
  onStart(): void;
  minWords?: number;
}

const langOf = (t: string): 'en' | 'ar' =>
  (t.match(/\p{Script=Arabic}/gu) ?? []).length > (t.match(/\p{Script=Latin}/gu) ?? []).length ? 'ar' : 'en';
const wordCount = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** On-demand grammar fix of the whole draft: Polish → preview of the changes → accept or dismiss. */
export function createPolish(shared: Shared, options: PolishOptions) {
  const { el, env, log } = shared;
  const { server, minWords = 3 } = options;
  let inFlight: AbortController | undefined;
  /** The open preview: the draft that was sent and the changes to apply to it. */
  let open: { sent: string; hunks: Hunk[]; lang: 'en' | 'ar' } | undefined;
  /** What the last multi-place accept changed, for "Revert polish". */
  let applied: { spans: AppliedSpan[]; lang: 'en' | 'ar' } | undefined;
  let detached = false;

  const update = (patch: Partial<PolishState>) => shared.setState({ polish: { ...shared.getState().polish, ...patch } });
  const sync = () => update({ canPolish: wordCount(buildTextMap(el).text) >= minWords });

  async function polishNow(): Promise<void> {
    if (detached || inFlight || shared.getState().popover) return;
    const sent = buildTextMap(el).text;
    if (wordCount(sent) < minWords) return;
    options.onStart();
    open = undefined;
    applied = undefined;
    const lang = langOf(sent);
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const ac = new AbortController();
    inFlight = ac;
    update({ busy: true, preview: undefined, revertable: false });
    const started = performance.now();
    log({ type: 'polish-request', text: sent });
    const reply = await server.polish(sent, ac.signal);
    log({ type: 'polish-reply', reply });
    inFlight = undefined;
    if (detached || ac.signal.aborted) return;
    update({ busy: false });

    if (!reply) {
      update({ preview: { dir, segments: [], message: 'Polishing is unavailable right now.' } });
      return;
    }
    const { hunks, segments } = reply.changed ? diff(sent, reply.polished) : { hunks: [], segments: [] };
    log({ type: 'polish-shown', lang, latencyMs: Math.round(performance.now() - started), changes: hunks.length });
    if (!hunks.length) {
      update({ preview: { dir, segments: [], message: 'No changes suggested.' } });
      return;
    }
    open = { sent, hunks, lang };
    update({ preview: { dir, segments } });
  }

  function accept() {
    if (!open) return;
    const res = applyPolish(el, open.sent, open.hunks, env.replace);
    if (!res.ok) {
      open = undefined;
      update({ preview: { dir: 'ltr', segments: [], message: 'The draft changed after you pressed Polish. Polish again to get fresh suggestions.' } });
      return;
    }
    log({ type: 'polish-accepted', lang: open.lang, changes: open.hunks.length });
    // One change undoes with one Ctrl/Cmd+Z; several get a one-click revert.
    applied = res.mode === 'per-span' ? { spans: res.spans, lang: open.lang } : undefined;
    open = undefined;
    update({ preview: undefined, revertable: !!applied });
  }

  /** Closes the preview (or message) without changing the draft. */
  function dismiss() {
    if (open) log({ type: 'polish-dismissed', lang: open.lang });
    open = undefined;
    update({ preview: undefined });
  }

  function revert() {
    if (!applied) return;
    revertSpans(applied.spans, env.replace);
    log({ type: 'polish-reverted', lang: applied.lang });
    applied = undefined;
    update({ revertable: false });
  }

  const observer = new MutationObserver(sync);
  observer.observe(el, { characterData: true, childList: true, subtree: true });
  sync();

  return {
    polishNow,
    accept,
    dismiss,
    revert,
    detach() {
      if (detached) return;
      detached = true;
      inFlight?.abort();
      observer.disconnect();
    },
  };
}

export type Polish = ReturnType<typeof createPolish>;
