import { buildTextMap } from './textmap';
import { diff } from './polish-diff';
import type { Server } from './server';
import type { PolishState, Shared } from './state';

export interface PolishOptions {
  server: Server;
  /** Called when Polish is pressed (hides the completion ghost text). */
  onStart(): void;
  minWords?: number;
}

const dirOf = (t: string): 'ltr' | 'rtl' =>
  (t.match(/\p{Script=Arabic}/gu) ?? []).length > (t.match(/\p{Script=Latin}/gu) ?? []).length ? 'rtl' : 'ltr';
const wordCount = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** On-demand grammar fix of the whole draft: Polish → preview of the changes → accept or dismiss. */
export function createPolish(shared: Shared, options: PolishOptions) {
  const { el, env, log } = shared;
  const { server, minWords = 3 } = options;
  let inFlight: AbortController | undefined;
  /** The open preview: the draft that was sent and its polished version. */
  let open: { sent: string; polished: string } | undefined;
  let detached = false;

  const update = (patch: Partial<PolishState>) => shared.setState({ polish: { ...shared.getState().polish, ...patch } });
  const sync = () => update({ canPolish: wordCount(buildTextMap(el).text) >= minWords });

  async function polishNow(): Promise<void> {
    if (detached || inFlight || shared.getState().popover) return;
    const sent = buildTextMap(el).text;
    if (wordCount(sent) < minWords) return;
    options.onStart();
    open = undefined;
    const dir = dirOf(sent);
    const ac = new AbortController();
    inFlight = ac;
    update({ busy: true, preview: undefined });
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
    if (!hunks.length) {
      update({ preview: { dir, segments: [], message: 'No changes suggested.' } });
      return;
    }
    open = { sent, polished: reply.polished };
    update({ preview: { dir, segments } });
  }

  /** Replaces the whole draft with the polished one: one undo step. */
  function accept() {
    if (!open) return;
    const { sent, polished } = open;
    open = undefined;
    if (buildTextMap(el).text !== sent) {
      update({ preview: { dir: 'ltr', segments: [], message: 'The draft changed after you pressed Polish. Polish again to get fresh suggestions.' } });
      return;
    }
    const all = el.ownerDocument.createRange();
    all.selectNodeContents(el);
    env.replace(all, polished);
    log({ type: 'polish-accepted' });
    update({ preview: undefined });
  }

  /** Closes the preview (or message) without changing the draft. */
  function dismiss() {
    open = undefined;
    update({ preview: undefined });
  }

  const observer = new MutationObserver(sync);
  observer.observe(el, { characterData: true, childList: true, subtree: true });
  sync();

  return {
    polishNow,
    accept,
    dismiss,
    detach() {
      if (detached) return;
      detached = true;
      inFlight?.abort();
      observer.disconnect();
    },
  };
}

export type Polish = ReturnType<typeof createPolish>;
