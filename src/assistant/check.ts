import { buildTextMap } from '../tokenizer';
import type { Completion } from './completion';
import type { Server, Turn } from './server';
import type { Spelling } from './spelling';
import type { Shared } from './state';

export interface CheckOptions {
  server: Server;
  spelling?: Spelling;
  completion?: Completion;
  conversation: () => Turn[];
  /** Sent with every request; empty = that source is off. */
  canned: string[];
  kb: string[];
  customWords: string[];
  /** At most one request per this many ms while typing. */
  throttleMs?: number;
}

/**
 * One request to the model for both spelling and completion. While the agent
 * types, it goes out at most once per `throttleMs`, and once more after the
 * last change. Each new request aborts the one still waiting for an answer.
 */
export function createCheck(shared: Shared, options: CheckOptions) {
  const { el, log } = shared;
  const { server, spelling, completion, canned, kb, customWords, throttleMs = 1000 } = options;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSentAt = -Infinity;
  let inFlight: AbortController | undefined;
  let detached = false;

  function schedule() {
    if (detached || timer) return;
    timer = setTimeout(() => void checkNow(), Math.max(0, lastSentAt + throttleMs - Date.now()));
  }

  async function checkNow(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const text = buildTextMap(el).text;
    const asked = completion?.wanted() ?? null;
    if (detached || !text.trim()) return;

    lastSentAt = Date.now();
    inFlight?.abort();
    const ac = new AbortController();
    inFlight = ac;
    const transcript = options.conversation();
    log({ type: 'check-request', text, completion: !!asked, turns: transcript.length, canned: canned.length, kb: kb.length });
    const reply = await server.check({ text, prefix: asked?.prefix ?? null, transcript, canned, kb, customWords }, ac.signal);
    log({ type: 'check-reply', reply, aborted: ac.signal.aborted });
    if (detached || ac.signal.aborted || !reply) return;
    inFlight = undefined;

    spelling?.applyMistakes(reply.mistakes);
    if (asked) completion?.show(reply.completion, asked, Math.round(Date.now() - lastSentAt));
  }

  // Only typing and edits count: a write without an input event (the page clearing the field on send) needs no check.
  el.addEventListener('input', schedule);

  return {
    /** Sends the request now instead of waiting for the throttle (tests). */
    checkNow,
    detach() {
      detached = true;
      clearTimeout(timer);
      inFlight?.abort();
      el.removeEventListener('input', schedule);
    },
  };
}
