import { buildTextMap, caretOffset } from '../tokenizer';
import type { CompletionFetcher, Turn } from './client';
import { browserMeasure, createGhost, type GhostMeasure } from './ghost';
import { detectMac, ghostKeyAction, nextWord } from './keys';
import { shouldRequest } from './trigger';

export interface CompletionEvent {
  type: 'completion-shown' | 'completion-accepted' | 'completion-dismissed';
  lang: 'en' | 'ar';
  /** Round trip from request to display. */
  latencyMs?: number;
  shownLength?: number;
  acceptedLength?: number;
}

export interface CompletionEnv {
  /** Same native edit path as spell checking: one undo step, host input event. */
  replace(range: Range, text: string): void;
  measure: GhostMeasure;
  /** Option (not Ctrl) + forward arrow accepts a word on macOS. */
  isMac: boolean;
}

export interface CompletionOptions {
  fetcher: CompletionFetcher;
  sources?: { transcript: boolean; canned: boolean; kb: boolean };
  /** The live conversation, oldest first. */
  transcript?: () => Turn[];
  /** Receives events without any completion or composer text. */
  onEvent?: (event: CompletionEvent) => void;
  debounceMs?: number;
  env?: Partial<CompletionEnv>;
}

export interface CompletionHandle {
  detach(): void;
  /** Hides any ghost text and cancels a pending request (e.g. when Polish opens). */
  dismiss(): void;
  /** Runs the pause check now (tests, demos). */
  requestNow(): Promise<void>;
}

const MAX_PREFIX = 600;
/** While the spelling popover or the polish panel is open, completion stays quiet. */
const OVERLAYS = '[data-bp-spell-popover], [data-bp-polish-panel]';

const langOf = (text: string): 'en' | 'ar' => {
  const last = text.match(/[\p{L}\p{M}]+/gu)?.at(-1) ?? '';
  return /\p{Script=Arabic}/u.test(last) ? 'ar' : 'en';
};

/**
 * Gmail-style inline completion for a contenteditable composer: after a pause
 * at the end of a sentence, asks the completion service and shows the answer
 * as ghost text; Tab accepts, typing the same characters keeps it, anything
 * else dismisses it.
 */
export function attachCompletion(el: HTMLElement, options: CompletionOptions): CompletionHandle {
  const { fetcher, sources = { transcript: true, canned: true, kb: true }, debounceMs = 400 } = options;
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const env: CompletionEnv = {
    replace:
      options.env?.replace ??
      ((range, text) => {
        el.focus();
        const sel = doc.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        doc.execCommand('insertText', false, text);
      }),
    measure: options.env?.measure ?? browserMeasure(),
    isMac: options.env?.isMac ?? detectMac(win.navigator),
  };
  const ghost = createGhost(el, env.measure);
  const emit = (e: CompletionEvent) => options.onEvent?.(e);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;
  let generation = 0;
  let composing = false;
  /**
   * The suggestion on screen. `consumed`: characters already typed through or
   * accepted; `wordAccepted`: a word-accept key was used, so ending it counts
   * as an accept.
   */
  let shown: { lang: 'en' | 'ar'; latencyMs: number; length: number; consumed: number; wordAccepted: boolean } | undefined;
  /** Flat caret offset the ghost is anchored to; any other caret dismisses it. */
  let anchor: number | undefined;
  let detached = false;

  const caretState = () => {
    const map = buildTextMap(el);
    const caret = caretOffset(map, doc.getSelection());
    return { map, caret };
  };

  const dirOf = (lang: 'en' | 'ar') => (lang === 'ar' ? 'rtl' : 'ltr');

  function dismiss() {
    if (!ghost.text || !shown) return;
    ghost.hide();
    if (shown.wordAccepted) {
      emit({ type: 'completion-accepted', lang: shown.lang, latencyMs: shown.latencyMs, shownLength: shown.length, acceptedLength: shown.consumed });
    } else {
      emit({ type: 'completion-dismissed', lang: shown.lang, shownLength: shown.length });
    }
    shown = undefined;
    anchor = undefined;
  }

  function cancelPending() {
    clearTimeout(timer);
    inFlight?.abort();
    inFlight = undefined;
    generation++;
  }

  const schedule = () => {
    if (detached) return;
    cancelPending();
    timer = setTimeout(() => void requestNow(), debounceMs);
  };

  async function requestNow(): Promise<void> {
    clearTimeout(timer);
    if (detached || ghost.text) return;
    const { map, caret } = caretState();
    if (caret === undefined) return;
    const before = map.text.slice(0, caret);
    const after = map.text.slice(caret).split('\n')[0];
    const popoverOpen = !!doc.querySelector(OVERLAYS);
    if (!shouldRequest({ before, after, composing, popoverOpen, enabled: true })) return;

    const mine = ++generation;
    const ac = new AbortController();
    inFlight = ac;
    const started = performance.now();
    const prefix = before.slice(-MAX_PREFIX);
    const reply = await fetcher({ prefix, transcript: sources.transcript ? (options.transcript?.() ?? []) : [], sources }, ac.signal);
    if (mine !== generation || detached || !reply?.completion) return;
    // Only show if nothing moved while waiting.
    const now = caretState();
    if (now.caret !== caret || now.map.text !== map.text || doc.querySelector(OVERLAYS)) return;

    const lang = langOf(prefix);
    ghost.show(reply.completion, dirOf(lang));
    anchor = caret;
    shown = { lang, latencyMs: Math.round(performance.now() - started), length: reply.completion.length, consumed: 0, wordAccepted: false };
    emit({ type: 'completion-shown', lang, latencyMs: shown.latencyMs, shownLength: shown.length });
  }

  const caretRange = () => {
    const sel = doc.getSelection();
    if (!sel?.rangeCount) return undefined;
    const at = sel.getRangeAt(0).cloneRange();
    at.collapse(false);
    return at;
  };

  /** Tab or the forward arrow: the rest of the suggestion, in one undo step. */
  function accept() {
    const text = ghost.text;
    const info = shown;
    const at = caretRange();
    if (!text || !info || !at) return;
    ghost.hide();
    shown = undefined;
    anchor = undefined;
    env.replace(at, text);
    emit({ type: 'completion-accepted', lang: info.lang, latencyMs: info.latencyMs, shownLength: info.length, acceptedLength: info.consumed + text.length });
  }

  /**
   * Ctrl/Option + forward arrow: the next word, in its own undo step. The
   * insertion fires an input event that the type-through path below consumes,
   * so the rest stays on screen (or the suggestion completes).
   */
  function acceptWord() {
    const at = caretRange();
    if (!ghost.text || !shown || !at) return;
    shown.wordAccepted = true;
    env.replace(at, nextWord(ghost.text));
  }

  // Typing-through is detected from the input event itself (not beforeinput,
  // which execCommand insertions and some IMEs don't fire): the agent typed the
  // ghost's next characters exactly at its anchor.
  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    if (ghost.text && shown && anchor !== undefined && ie.inputType === 'insertText' && ie.data && ghost.text.startsWith(ie.data)) {
      const caret = caretState().caret;
      if (caret === anchor + ie.data.length) {
        const rest = ghost.text.slice(ie.data.length);
        anchor = caret;
        shown.consumed += ie.data.length;
        if (rest) {
          ghost.show(rest, dirOf(shown.lang));
        } else {
          // The agent typed the whole suggestion: it was right.
          ghost.hide();
          emit({ type: 'completion-accepted', lang: shown.lang, latencyMs: shown.latencyMs, shownLength: shown.length, acceptedLength: shown.length });
          shown = undefined;
          anchor = undefined;
          schedule(); // used up: the next pause may bring a new suggestion
        }
        return;
      }
    }
    dismiss();
    schedule();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const active = doc.activeElement;
    if (!ghost.text || !shown || !active || !el.contains(active)) return;
    const action = ghostKeyAction(e, dirOf(shown.lang), env.isMac);
    if (action === 'none') return;
    if (action === 'dismiss') {
      dismiss(); // not intercepted: Enter still sends, arrows still move or select
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action === 'accept-all') accept();
    else if (action === 'accept-word') acceptWord();
    else dismiss();
  };

  const onSelectionChange = () => {
    if (!ghost.text) return;
    if (caretState().caret !== anchor) dismiss();
  };

  const onComposition = (e: Event) => {
    composing = e.type === 'compositionstart';
    if (composing) {
      cancelPending();
      dismiss();
    }
  };

  const onBlur = () => {
    cancelPending();
    dismiss();
  };
  const onScroll = () => ghost.reposition();

  // Host writes without input events, e.g. Agent Desktop clearing the composer on send.
  const observer = new MutationObserver(() => {
    if (ghost.text && caretState().map.text.slice(0, anchor) === '') dismiss();
  });
  observer.observe(el, { characterData: true, childList: true, subtree: true });

  el.addEventListener('input', onInput);
  el.addEventListener('compositionstart', onComposition);
  el.addEventListener('compositionend', onComposition);
  el.addEventListener('blur', onBlur);
  el.addEventListener('scroll', onScroll);
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('resize', onScroll);
  win.addEventListener('scroll', onScroll, true);
  doc.addEventListener('selectionchange', onSelectionChange);

  return {
    requestNow,
    dismiss() {
      cancelPending();
      dismiss();
    },
    detach() {
      if (detached) return;
      detached = true;
      cancelPending();
      observer.disconnect();
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onComposition);
      el.removeEventListener('compositionend', onComposition);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('scroll', onScroll);
      win.removeEventListener('keydown', onKeyDown, true);
      win.removeEventListener('resize', onScroll);
      win.removeEventListener('scroll', onScroll, true);
      doc.removeEventListener('selectionchange', onSelectionChange);
      ghost.remove();
    },
  };
}
