import { buildTextMap, caretOffset } from '../tokenizer';
import { ghostKeyAction, ghostLayout, nextWord, shouldRequest } from './completion-rules';
import type { Shared } from './state';

/** The field as it was when a completion was asked for. */
export interface CompletionAsk {
  prefix: string;
  caret: number;
  text: string;
}

const langOf = (text: string): 'en' | 'ar' => {
  const last = text.match(/[\p{L}\p{M}]+/gu)?.at(-1) ?? '';
  return /\p{Script=Arabic}/u.test(last) ? 'ar' : 'en';
};
const dirOf = (lang: 'en' | 'ar') => (lang === 'ar' ? 'rtl' : 'ltr');

/**
 * Gmail-style inline completion: says when a completion is wanted (the caret
 * at the end of a line, nothing open), and shows the answer as ghost text.
 * Tab accepts it, typing the same characters keeps it, anything else
 * dismisses it. The request itself goes out with the spelling check
 * (`check.ts`).
 */
export function createCompletion(shared: Shared) {
  const { el, env, log } = shared;
  const doc = el.ownerDocument;
  const win = doc.defaultView!;

  let composing = false;
  /**
   * The suggestion on screen. `rest`: what is still to accept; `anchor`: the
   * caret offset it is attached to (any other caret dismisses it);
   * `consumed`: characters already typed through or accepted;
   * `wordAccepted`: a word-accept key was used, so ending it counts as accept.
   */
  let shown:
    | { rest: string; anchor: number; lang: 'en' | 'ar'; latencyMs: number; length: number; consumed: number; wordAccepted: boolean }
    | undefined;
  let detached = false;

  const caretState = () => {
    const map = buildTextMap(el);
    return { map, caret: caretOffset(map, doc.getSelection()) };
  };
  const overlayOpen = () => !!shared.getState().popover || !!shared.getState().polish.preview;

  /** Draws (or hides) the ghost text for the current suggestion. */
  function render() {
    if (!shown) {
      if (shared.getState().ghost) shared.setState({ ghost: undefined });
      return;
    }
    const cs = win.getComputedStyle(el);
    const style = { font: cs.font, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, direction: cs.direction };
    shared.setState({ ghost: { text: shown.rest, layout: ghostLayout(env.caretRect(el), env.contentBox(el), style, dirOf(shown.lang)) } });
  }

  function dismiss() {
    if (!shown) return;
    const s = shown;
    shown = undefined;
    render();
    if (s.wordAccepted) {
      log({ type: 'completion-accepted', lang: s.lang, latencyMs: s.latencyMs, shownLength: s.length, acceptedLength: s.consumed });
    } else {
      log({ type: 'completion-dismissed', lang: s.lang, shownLength: s.length });
    }
  }

  /** What to ask a completion for, or null when none is wanted now. */
  function wanted(): CompletionAsk | null {
    if (detached || shown) return null;
    const { map, caret } = caretState();
    if (caret === undefined) return null;
    const before = map.text.slice(0, caret);
    const after = map.text.slice(caret).split('\n')[0];
    if (!shouldRequest({ before, after, composing, overlayOpen: overlayOpen() })) return null;
    return { prefix: before, caret, text: map.text };
  }

  /** Shows the answer as ghost text, if nothing moved since it was asked for. */
  function show(completion: string, asked: CompletionAsk, latencyMs: number) {
    if (detached || shown || !completion) return;
    const now = caretState();
    if (now.caret !== asked.caret || now.map.text !== asked.text || overlayOpen()) return;
    const lang = langOf(asked.prefix);
    shown = { rest: completion, anchor: asked.caret, lang, latencyMs, length: completion.length, consumed: 0, wordAccepted: false };
    render();
    log({ type: 'completion-shown', lang, latencyMs, shownLength: shown.length });
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
    const s = shown;
    const at = caretRange();
    if (!s || !at) return;
    shown = undefined;
    render();
    env.replace(at, s.rest);
    log({ type: 'completion-accepted', lang: s.lang, latencyMs: s.latencyMs, shownLength: s.length, acceptedLength: s.consumed + s.rest.length });
  }

  /**
   * Ctrl/Option + forward arrow: the next word, in its own undo step. The
   * insertion fires an input event that the type-through path below consumes,
   * so the rest stays on screen (or the suggestion completes).
   */
  function acceptWord() {
    const at = caretRange();
    if (!shown || !at) return;
    shown.wordAccepted = true;
    env.replace(at, nextWord(shown.rest));
  }

  // Typing through: the agent typed the ghost's next characters exactly at its anchor.
  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    if (shown && ie.inputType === 'insertText' && ie.data && shown.rest.startsWith(ie.data)) {
      const caret = caretState().caret;
      if (caret === shown.anchor + ie.data.length) {
        shown.rest = shown.rest.slice(ie.data.length);
        shown.anchor = caret;
        shown.consumed += ie.data.length;
        if (shown.rest) {
          render();
        } else {
          // The agent typed the whole suggestion: it was right.
          const s = shown;
          shown = undefined;
          render();
          log({ type: 'completion-accepted', lang: s.lang, latencyMs: s.latencyMs, shownLength: s.length, acceptedLength: s.length });
        }
        return;
      }
    }
    dismiss();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const active = doc.activeElement;
    if (!shown || !active || !el.contains(active)) return;
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
    if (shown && caretState().caret !== shown.anchor) dismiss();
  };
  const onComposition = (e: Event) => {
    composing = e.type === 'compositionstart';
    if (composing) dismiss();
  };
  const onBlur = dismiss;

  // Writes without input events, e.g. the page clearing the field on send.
  const observer = new MutationObserver(() => {
    if (shown && caretState().map.text.slice(0, shown.anchor) === '') dismiss();
  });
  observer.observe(el, { characterData: true, childList: true, subtree: true });

  el.addEventListener('input', onInput);
  el.addEventListener('compositionstart', onComposition);
  el.addEventListener('compositionend', onComposition);
  el.addEventListener('blur', onBlur);
  el.addEventListener('scroll', render);
  // Capture on the window: Tab must not reach the page's own handlers.
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('resize', render);
  win.addEventListener('scroll', render, true);
  doc.addEventListener('selectionchange', onSelectionChange);

  return {
    wanted,
    show,
    /** Hides any ghost text (e.g. when Polish opens). */
    dismiss,
    detach() {
      if (detached) return;
      detached = true;
      observer.disconnect();
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onComposition);
      el.removeEventListener('compositionend', onComposition);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('scroll', render);
      win.removeEventListener('keydown', onKeyDown, true);
      win.removeEventListener('resize', render);
      win.removeEventListener('scroll', render, true);
      doc.removeEventListener('selectionchange', onSelectionChange);
      shown = undefined;
      render();
    },
  };
}

export type Completion = ReturnType<typeof createCompletion>;
