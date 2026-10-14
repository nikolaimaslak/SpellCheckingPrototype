import { ghostKeyAction, ghostLayout, nextWord, shouldRequest } from './completion-rules';
import { AUTOCORRECTED, createHighlight, SPELLING_ERROR } from './highlights';
import type { Mistake, Server, Turn } from './server';
import type { Shared } from './state';
import { buildTextMap, caretOffset, pointAt, rangeFor } from './textmap';

export interface CheckOptions {
  server: Server;
  /** off; suggest: underline and offer fixes; auto: also replace the mistakes the model is sure about. */
  spelling: 'off' | 'suggest' | 'auto';
  completion: boolean;
  /** Never reported, underlined or auto-corrected. */
  customWords: string[];
  /** Read on every request; words in the customer's turns are never auto-corrected (names). */
  conversation: () => Turn[];
  /** Sent with every request; empty = that source is off. */
  canned: string[];
  kb: string[];
  /** At most one request per this many ms while typing. */
  throttleMs?: number;
  /** How long an auto-correction stays highlighted. */
  flashMs?: number;
}

/** A mistake's place in the field's flat text. */
interface Spot {
  word: string;
  start: number;
  end: number;
}

const SHORTCUT = (e: KeyboardEvent) => e.key === '.' && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
const dirOf = (text: string): 'ltr' | 'rtl' => (/\p{Script=Arabic}/u.test(text.match(/[\p{L}\p{M}]+/gu)?.at(-1) ?? '') ? 'rtl' : 'ltr');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsOf = (text: string) => (text.match(/[\p{L}\p{M}]+/gu) ?? []).map((w) => w.toLowerCase());

/** Every place the words stand as whole words in the text, in order. */
function findSpots(text: string, words: Iterable<string>): Spot[] {
  const spots: Spot[] = [];
  for (const word of words) {
    const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{M}\\p{N}])`, 'gu');
    for (const m of text.matchAll(re)) spots.push({ word, start: m.index, end: m.index + word.length });
  }
  return spots.sort((a, b) => a.start - b.start);
}

/**
 * Spelling and inline completion for the message field, from one request to
 * the model. While the agent types, the draft goes out at most once per
 * `throttleMs` and once more after the last change. The answer's mistakes are
 * underlined (fixes in the popover: click or Ctrl+.), and in `auto` mode the
 * sure ones are replaced, one undo step each. The answer's completion is shown
 * as ghost text after the caret: Tab accepts it, typing the same characters
 * keeps it, anything else dismisses it.
 */
export function createCheck(shared: Shared, options: CheckOptions) {
  const { el, env, log } = shared;
  const { server, spelling, completion, canned, kb, throttleMs = 1000, flashMs = 2000 } = options;
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const customWords = new Set(options.customWords);
  const underline = createHighlight(env.highlights, SPELLING_ERROR);
  const flash = createHighlight(env.highlights, AUTOCORRECTED);

  /** The last answer's mistakes, by word. */
  let mistakes = new Map<string, Mistake>();
  /** Words the agent ignored or reverted: never underlined or corrected again. */
  const ignored = new Set<string>();
  /** Auto-corrections not yet undone: original → replacement. */
  const autoCorrected = new Map<string, string>();
  let popover: { spot: Spot; selection?: Range } | undefined;
  /** The ghost text on screen: what is still to accept, and the caret offset it hangs on. */
  let ghost: { rest: string; anchor: number; dir: 'ltr' | 'rtl' } | undefined;
  let composing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSentAt = -Infinity;
  let inFlight: AbortController | undefined;
  let detached = false;

  // The browser's own spell check would underline the same words twice.
  const originalSpellcheck = el.getAttribute('spellcheck');
  if (spelling !== 'off') el.setAttribute('spellcheck', 'false');

  const textAndCaret = () => {
    const map = buildTextMap(el);
    return { map, caret: caretOffset(map, doc.getSelection()) };
  };
  const overlayOpen = () => !!popover || !!shared.getState().polish.preview;
  const isMistake = (word: string) => mistakes.has(word) && !ignored.has(word) && !customWords.has(word);
  /** The mistakes in the field, except the word the agent is typing (the caret at its end). */
  const mistakeSpots = (text: string, caret: number | undefined) =>
    findSpots(text, [...mistakes.keys()].filter(isMistake)).filter((s) => s.end !== caret);

  // --- The request -----------------------------------------------------------

  function schedule() {
    if (detached || timer) return;
    timer = setTimeout(() => void checkNow(), Math.max(0, lastSentAt + throttleMs - Date.now()));
  }

  async function checkNow(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const { map, caret } = textAndCaret();
    if (detached || !map.text.trim()) return;
    const prefix = caret !== undefined && wantsCompletion(map.text, caret) ? map.text.slice(0, caret) : null;

    lastSentAt = Date.now();
    inFlight?.abort();
    const ac = new AbortController();
    inFlight = ac;
    log({ type: 'check-request', text: map.text, completion: prefix !== null });
    const body = { text: map.text, prefix, transcript: options.conversation(), canned, kb, customWords: options.customWords };
    const reply = await server.check(body, ac.signal);
    if (ac.signal.aborted || detached) return;
    log({ type: 'check-reply', reply });
    inFlight = undefined;
    if (!reply) return;

    if (spelling !== 'off') {
      mistakes = new Map(reply.mistakes.map((m) => [m.word, m]));
      if (spelling === 'auto') autoCorrect();
      drawUnderlines();
    }
    // Only if nothing moved while waiting.
    const now = textAndCaret();
    if (prefix !== null && reply.completion && now.caret === caret && now.map.text === map.text && !overlayOpen()) {
      ghost = { rest: reply.completion, anchor: caret!, dir: dirOf(prefix) };
      drawGhost();
    }
  }

  function wantsCompletion(text: string, caret: number) {
    if (!completion || ghost) return false;
    return shouldRequest({ before: text.slice(0, caret), after: text.slice(caret).split('\n')[0], composing, overlayOpen: overlayOpen() });
  }

  // --- Underlines and auto-correct ---------------------------------------------

  function drawUnderlines() {
    if (spelling === 'off' || detached) return;
    const { map, caret } = textAndCaret();
    if (!map.text.trim()) mistakes = new Map(); // sent or cleared: the next message starts fresh
    underline.setRanges(mistakeSpots(map.text, caret).map((s) => rangeFor(map, s.start, s.end)));
  }

  /** Replaces the sure mistakes, last first so earlier offsets stay put, and keeps the caret where it was. */
  function autoCorrect() {
    const fromCustomer = new Set(options.conversation().filter((t) => t.role === 'customer').flatMap((t) => wordsOf(t.text)));
    const { map, caret } = textAndCaret();
    const spots = mistakeSpots(map.text, caret).filter((s) => mistakes.get(s.word)!.sure && !fromCustomer.has(s.word.toLowerCase()));
    if (!spots.length) return;

    let caretShift = 0;
    const fixed: { start: number; length: number }[] = [];
    for (const spot of [...spots].reverse()) {
      const fix = mistakes.get(spot.word)!.fixes[0];
      const now = buildTextMap(el);
      if (now.text.slice(spot.start, spot.end) !== spot.word) continue;
      env.replace(rangeFor(now, spot.start, spot.end), fix);
      const delta = fix.length - spot.word.length;
      if (caret !== undefined && spot.end <= caret) caretShift += delta;
      // Every fix already made lies after this one: shift their places.
      for (const f of fixed) f.start += delta;
      fixed.push({ start: spot.start, length: fix.length });
      autoCorrected.set(spot.word, fix);
      log({ type: 'autocorrect', original: spot.word, replacement: fix });
    }

    const after = buildTextMap(el);
    if (caret !== undefined) {
      const p = pointAt(after, caret + caretShift);
      doc.getSelection()?.collapse(p.node, p.offset);
    }
    flash.setRanges(fixed.map((f) => rangeFor(after, f.start, f.start + f.length)));
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flash.setRanges([]), flashMs);
  }

  /** Ctrl/Cmd+Z brought back an auto-corrected word: never correct or underline it again. */
  function detectUndo() {
    const words = new Set(wordsOf(buildTextMap(el).text));
    for (const [original, replacement] of autoCorrected) {
      if (!words.has(original.toLowerCase())) continue;
      autoCorrected.delete(original);
      ignored.add(original);
      log({ type: 'revert', original, replacement });
    }
  }

  // --- Popover -------------------------------------------------------------

  /** Opens the fixes for the mistake at the caret. */
  function openForCaret(): boolean {
    if (spelling === 'off' || shared.getState().polish.preview) return false; // never two panels at once
    const { map, caret } = textAndCaret();
    if (caret === undefined) return false;
    const spot = findSpots(map.text, [...mistakes.keys()].filter(isMistake)).find((s) => s.start <= caret && caret <= s.end);
    if (!spot) return false;
    const sel = doc.getSelection();
    popover = { spot, selection: sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : undefined };
    dismissGhost();
    shared.setState({
      popover: {
        rect: env.rectOf(rangeFor(map, spot.start, spot.end)),
        dir: dirOf(spot.word),
        font: win.getComputedStyle(el).font,
        suggestions: mistakes.get(spot.word)!.fixes.slice(0, 5),
      },
    });
    return true;
  }

  /** Closes the popover; `restoreFocus` puts the caret back in the field (Escape, or a choice). */
  function closePopover(restoreFocus = false) {
    const open = popover;
    if (!open) return;
    popover = undefined;
    shared.setState({ popover: undefined });
    if (restoreFocus && open.selection) {
      el.focus();
      const sel = doc.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(open.selection);
    }
  }

  function pick(suggestion: string) {
    const spot = popover?.spot;
    closePopover(true);
    const map = buildTextMap(el);
    if (!spot || map.text.slice(spot.start, spot.end) !== spot.word) return; // the word changed meanwhile
    env.replace(rangeFor(map, spot.start, spot.end), suggestion);
    log({ type: 'pick', original: spot.word, replacement: suggestion });
    drawUnderlines();
  }

  function ignore() {
    const spot = popover?.spot;
    closePopover(true);
    if (!spot) return;
    ignored.add(spot.word);
    log({ type: 'ignore', word: spot.word });
    drawUnderlines();
  }

  // --- Ghost text --------------------------------------------------------------

  function drawGhost() {
    if (!ghost) {
      if (shared.getState().ghost) shared.setState({ ghost: undefined });
      return;
    }
    const cs = win.getComputedStyle(el);
    const style = { font: cs.font, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, direction: cs.direction };
    shared.setState({ ghost: { text: ghost.rest, layout: ghostLayout(env.caretRect(el), env.contentBox(el), style, ghost.dir) } });
  }

  function dismissGhost() {
    if (!ghost) return;
    ghost = undefined;
    drawGhost();
  }

  const caretRange = () => {
    const sel = doc.getSelection();
    if (!sel?.rangeCount) return undefined;
    const at = sel.getRangeAt(0).cloneRange();
    at.collapse(false);
    return at;
  };

  /** Tab or the forward arrow: the rest of the suggestion, in one undo step. */
  function acceptGhost() {
    const at = caretRange();
    if (!ghost || !at) return;
    const { rest } = ghost;
    dismissGhost();
    env.replace(at, rest);
    log({ type: 'completion-accepted', text: rest });
  }

  /** Ctrl/Option + forward arrow: the next word, in its own undo step; typing through keeps the rest. */
  function acceptGhostWord() {
    const at = caretRange();
    if (ghost && at) env.replace(at, nextWord(ghost.rest));
  }

  /** The agent typed the ghost's next characters exactly at its anchor: keep the rest on screen. */
  function typeThrough(e: InputEvent): boolean {
    if (!ghost || e.inputType !== 'insertText' || !e.data || !ghost.rest.startsWith(e.data)) return false;
    const { caret } = textAndCaret();
    if (caret !== ghost.anchor + e.data.length) return false;
    ghost.rest = ghost.rest.slice(e.data.length);
    ghost.anchor = caret;
    if (ghost.rest) drawGhost();
    else dismissGhost();
    return true;
  }

  // --- Events --------------------------------------------------------------

  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    if (ie.inputType === 'historyUndo') detectUndo();
    if (!typeThrough(ie)) dismissGhost();
    drawUnderlines();
    schedule();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (SHORTCUT(e) && openForCaret()) {
      e.preventDefault();
      return;
    }
    const active = doc.activeElement;
    if (!ghost || !active || !el.contains(active)) return;
    const action = ghostKeyAction(e, ghost.dir, env.isMac);
    if (action === 'none') return;
    if (action === 'dismiss') {
      dismissGhost(); // not intercepted: Enter still sends, arrows still move or select
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action === 'accept-all') acceptGhost();
    else if (action === 'accept-word') acceptGhostWord();
    else dismissGhost();
  };
  // Let the click settle the caret first.
  const onMouseUp = () => setTimeout(openForCaret, 0);
  const onSelectionChange = () => {
    const sel = doc.getSelection();
    if (!sel?.anchorNode || !el.contains(sel.anchorNode)) return;
    if (ghost && textAndCaret().caret !== ghost.anchor) dismissGhost();
    drawUnderlines();
  };
  const onComposition = (e: Event) => {
    composing = e.type === 'compositionstart';
    if (composing) dismissGhost();
  };
  // Writes that fire no input event (the page clearing the field on send).
  const observer = new MutationObserver(() => {
    if (ghost && !buildTextMap(el).text.trim()) dismissGhost();
    drawUnderlines();
  });

  observer.observe(el, { characterData: true, childList: true, subtree: true });
  el.addEventListener('input', onInput);
  el.addEventListener('mouseup', onMouseUp);
  el.addEventListener('compositionstart', onComposition);
  el.addEventListener('compositionend', onComposition);
  el.addEventListener('blur', dismissGhost);
  el.addEventListener('scroll', drawGhost);
  // Capture on the window: Tab must not reach the page's own handlers.
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('resize', drawGhost);
  win.addEventListener('scroll', drawGhost, true);
  doc.addEventListener('selectionchange', onSelectionChange);

  return {
    /** Sends the request now instead of waiting for the throttle. */
    checkNow,
    pick,
    ignore,
    closePopover,
    /** Hides any ghost text (e.g. when Polish opens). */
    dismissGhost,
    detach() {
      if (detached) return;
      detached = true;
      clearTimeout(timer);
      clearTimeout(flashTimer);
      inFlight?.abort();
      observer.disconnect();
      el.removeEventListener('input', onInput);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('compositionstart', onComposition);
      el.removeEventListener('compositionend', onComposition);
      el.removeEventListener('blur', dismissGhost);
      el.removeEventListener('scroll', drawGhost);
      win.removeEventListener('keydown', onKeyDown, true);
      win.removeEventListener('resize', drawGhost);
      win.removeEventListener('scroll', drawGhost, true);
      doc.removeEventListener('selectionchange', onSelectionChange);
      closePopover();
      ghost = undefined;
      drawGhost();
      underline.release();
      flash.release();
      if (originalSpellcheck === null) el.removeAttribute('spellcheck');
      else el.setAttribute('spellcheck', originalSpellcheck);
    },
  };
}

export type Check = ReturnType<typeof createCheck>;
