import { buildTextMap, caretOffset, flatOffsetOf, pointAt, rangeFor, tokenize, type Lang, type Token } from '../tokenizer';
import { AUTOCORRECTED, createHighlight, SPELLING_ERROR } from './highlights';
import type { Mistake } from './server';
import type { Shared } from './state';

export interface SpellingOptions {
  /** suggest: underline and offer fixes; auto: also replace the mistakes the model is sure about. */
  mode: 'suggest' | 'auto';
  /** Never underlined or auto-corrected. */
  customWords: string[];
  /** The conversation; words in the customer's turns are never auto-corrected (names). */
  conversation: () => readonly { role: string; text: string }[];
  debounceMs?: number;
  /** How long an auto-correction stays highlighted. */
  flashMs?: number;
}

/** An auto-correction that can still be reverted. */
interface Correction {
  /** Live range over the replacement text. */
  range: Range;
  original: string;
  replacement: string;
  lang: Lang;
  /** Flat offset where the word starts: the anchor for detecting an Undo. */
  flatStart: number;
}

/** What the open popover is about. */
type PopoverTarget = { token: Token; suggestions: string[] } | { correction: Correction };

const SHORTCUT = (e: KeyboardEvent) => e.key === '.' && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
const keyOf = (t: { lang: Lang; text: string }) => `${t.lang}:${t.text}`;

function containsCaret(range: Range, sel: Selection | null): boolean {
  if (!sel?.isCollapsed || !sel.anchorNode) return false;
  try {
    return range.isPointInRange(sel.anchorNode, sel.anchorOffset);
  } catch {
    return false;
  }
}

/** Lowercased words of the customer's turns. */
function customerWords(turns: readonly { role: string; text: string }[]): Set<string> {
  const text = turns.filter((t) => t.role === 'customer').map((t) => t.text).join(' ');
  return new Set((text.match(/[\p{L}\p{M}]+/gu) ?? []).map((w) => w.toLowerCase()));
}

/**
 * Spell checking for the message field, from the model's mistakes
 * (`applyMistakes`, fed by `check.ts`): underlines misspelled finished words
 * and offers fixes (click or Ctrl+.); in `auto` mode it also replaces the
 * mistakes the model is sure about. Every automatic change is flashed and
 * undoes with Ctrl/Cmd+Z.
 */
export function createSpelling(shared: Shared, options: SpellingOptions) {
  const { el, env, log } = shared;
  const { mode, debounceMs = 150, flashMs = 2000 } = options;
  const doc = el.ownerDocument;
  const customWords = new Set(options.customWords);
  const underline = createHighlight(env.highlights, SPELLING_ERROR);
  const flash = createHighlight(env.highlights, AUTOCORRECTED);
  const flashing = new Set<Range>();
  const flashTimers = new Set<ReturnType<typeof setTimeout>>();
  const ignored = new Set<string>();
  /** Words already logged as `flag` in this message (lang:text). */
  const reported = new Set<string>();
  /** The last answer's mistakes, by word. */
  let mistakes = new Map<string, Mistake>();
  let corrections: Correction[] = [];
  let flagged: Token[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let popover: { target: PopoverTarget; selection?: Range } | undefined;
  let detached = false;

  // The browser's own spell check would underline the same words twice.
  const originalSpellcheck = el.getAttribute('spellcheck');
  el.setAttribute('spellcheck', 'false');

  const isMistake = (t: Token) => mistakes.has(t.text) && !ignored.has(keyOf(t)) && !customWords.has(t.text);

  /** Underlines the words of the last answer that are still in the field. */
  function recheck() {
    clearTimeout(timer);
    if (detached) return;
    const map = buildTextMap(el);
    if (!map.text.trim()) {
      // Sent or cleared: the next message starts fresh.
      mistakes = new Map();
      reported.clear();
    }
    // A word still being typed keeps an underline it already had (same text,
    // same place), so clicking into a flagged word doesn't hide it.
    const previously = new Set(flagged.map((t) => `${t.start}:${keyOf(t)}`));
    flagged = tokenize(map, caretOffset(map, doc.getSelection())).filter(
      (t) => isMistake(t) && (!t.pending || previously.has(`${t.start}:${keyOf(t)}`)),
    );
    underline.setRanges(flagged.map((t) => t.range));
    for (const t of flagged) {
      if (!reported.has(keyOf(t))) {
        reported.add(keyOf(t));
        log({ type: 'flag', lang: t.lang, original: t.text });
      }
    }
    // A correction the agent has since edited can no longer be reverted.
    corrections = corrections.filter((c) => c.range.toString() === c.replacement);
  }

  const schedule = () => {
    if (detached) return;
    clearTimeout(timer);
    timer = setTimeout(recheck, debounceMs);
  };

  /** Takes the model's mistakes for the current draft: auto-corrects the sure ones, underlines the rest. */
  function applyMistakes(list: Mistake[]) {
    if (detached) return;
    mistakes = new Map(list.map((m) => [m.word, m]));
    if (mode === 'auto') autoCorrectSure();
    recheck();
  }

  function autoCorrectSure() {
    const fromCustomer = customerWords(options.conversation());
    const map = buildTextMap(el);
    // Finished words only: never the one the agent is typing.
    const tokens = tokenize(map, caretOffset(map, doc.getSelection())).filter(
      (t) => !t.pending && isMistake(t) && mistakes.get(t.text)!.sure && !fromCustomer.has(t.text.toLowerCase()),
    );
    for (const token of tokens) {
      if (token.range.toString() === token.text) applyFix(token, mistakes.get(token.text)!.fixes[0]);
    }
  }

  function flashRange(range: Range) {
    flashing.add(range);
    flash.setRanges(flashing);
    const t = setTimeout(() => {
      flashTimers.delete(t);
      flashing.delete(range);
      flash.setRanges(flashing);
    }, flashMs);
    flashTimers.add(t);
  }

  /** Replaces the word in one undo step and keeps the caret where the agent was typing. */
  function applyFix(token: Token, fix: string) {
    const { text: word, lang } = token;
    const before = buildTextMap(el);
    const start = flatOffsetOf(before, token.range.startContainer, token.range.startOffset);
    const caretBefore = caretOffset(before, doc.getSelection());
    env.replace(token.range, fix);

    const after = buildTextMap(el);
    if (caretBefore !== undefined) {
      const delta = fix.length - word.length;
      const p = pointAt(after, caretBefore >= start + word.length ? caretBefore + delta : caretBefore);
      doc.getSelection()?.collapse(p.node, p.offset);
    }
    if (after.text.slice(start, start + fix.length) !== fix) return;
    const range = rangeFor(after, start, start + fix.length);
    corrections.push({ range, original: word, replacement: fix, lang, flatStart: start });
    flashRange(range);
    log({ type: 'autocorrect', lang, original: word, replacement: fix });
  }

  /** An Undo that brought back an auto-corrected word counts as a revert: never correct it again. */
  function detectUndoRevert() {
    const tokens = tokenize(buildTextMap(el));
    corrections = corrections.filter((c) => {
      if (c.range.toString() === c.replacement) return true; // still stands
      if (tokens.some((t) => t.start === c.flatStart && t.text === c.original && t.lang === c.lang)) {
        ignored.add(keyOf({ lang: c.lang, text: c.original }));
        log({ type: 'revert', lang: c.lang, original: c.original, replacement: c.replacement });
      }
      return false;
    });
  }

  function revertCorrection(c: Correction) {
    if (c.range.toString() !== c.replacement) return;
    corrections = corrections.filter((x) => x !== c);
    ignored.add(keyOf({ lang: c.lang, text: c.original }));
    env.replace(c.range, c.original);
    log({ type: 'revert', lang: c.lang, original: c.original, replacement: c.replacement });
    recheck();
  }

  // --- Popover -------------------------------------------------------------

  function openPopover(range: Range, lang: Lang, target: PopoverTarget) {
    const sel = doc.getSelection();
    popover = { target, selection: sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : undefined };
    shared.setState({
      popover: {
        rect: env.rectOf(range),
        dir: lang === 'ar' ? 'rtl' : 'ltr',
        font: doc.defaultView?.getComputedStyle(el).font ?? '',
        suggestions: 'token' in target ? target.suggestions : [],
        revertTo: 'correction' in target ? target.correction.original : undefined,
      },
    });
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

  /** Opens the popover for the word at the caret: revert for an auto-correction, fixes for a flagged word. */
  function openForCaret(): boolean {
    if (shared.getState().polish.preview) return false; // never two panels at once
    const sel = doc.getSelection();
    const correction = corrections.find((c) => c.range.toString() === c.replacement && containsCaret(c.range, sel));
    if (correction) {
      openPopover(correction.range, correction.lang, { correction });
      return true;
    }
    const token = sel?.anchorNode && el.contains(sel.anchorNode) ? flagged.find((t) => containsCaret(t.range, sel)) : undefined;
    const mistake = token && mistakes.get(token.text);
    if (!token || !mistake) return false;
    openPopover(token.range, token.lang, { token, suggestions: mistake.fixes.slice(0, 5) });
    return true;
  }

  function pick(suggestion: string) {
    const target = popover?.target;
    closePopover(true);
    if (!target || !('token' in target)) return;
    const { token, suggestions } = target;
    if (token.range.toString() !== token.text) return; // the word changed since the popover opened
    env.replace(token.range, suggestion);
    log({ type: 'accept', lang: token.lang, original: token.text, replacement: suggestion, rank: suggestions.indexOf(suggestion) + 1, offered: suggestions.length });
    recheck();
  }

  function ignore() {
    const target = popover?.target;
    closePopover(true);
    if (!target || !('token' in target)) return;
    ignored.add(keyOf(target.token));
    log({ type: 'ignore', lang: target.token.lang, original: target.token.text });
    recheck();
  }

  function revert() {
    const target = popover?.target;
    closePopover(true);
    if (target && 'correction' in target) revertCorrection(target.correction);
  }

  // --- Events --------------------------------------------------------------

  const onInput = (e: Event) => {
    schedule();
    if ((e as InputEvent).inputType === 'historyUndo') detectUndoRevert();
  };
  // Let the click settle the caret first.
  const onMouseUp = () => setTimeout(openForCaret, 0);
  const onKeyDown = (e: KeyboardEvent) => {
    if (SHORTCUT(e) && openForCaret()) e.preventDefault();
  };
  const onSelectionChange = () => {
    const sel = doc.getSelection();
    if (sel?.anchorNode && el.contains(sel.anchorNode)) schedule();
  };

  // Writes that fire no input event (the page clearing the field on send).
  const observer = new MutationObserver(schedule);
  observer.observe(el, { characterData: true, childList: true, subtree: true });
  el.addEventListener('input', onInput);
  el.addEventListener('mouseup', onMouseUp);
  el.addEventListener('keydown', onKeyDown);
  doc.addEventListener('selectionchange', onSelectionChange);

  return {
    applyMistakes,
    /** Redraws the underlines now instead of waiting for the debounce (tests). */
    recheck,
    pick,
    ignore,
    revert,
    closePopover,
    detach() {
      if (detached) return;
      detached = true;
      clearTimeout(timer);
      flashTimers.forEach(clearTimeout);
      observer.disconnect();
      el.removeEventListener('input', onInput);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('selectionchange', onSelectionChange);
      closePopover();
      underline.release();
      flash.release();
      if (originalSpellcheck === null) el.removeAttribute('spellcheck');
      else el.setAttribute('spellcheck', originalSpellcheck);
    },
  };
}

export type Spelling = ReturnType<typeof createSpelling>;
