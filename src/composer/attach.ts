import { decide } from '../autocorrect/confidence';
import { completedWord } from '../autocorrect/trigger';
import type { Lang } from '../spell/protocol';
import type { SpellService } from '../spell/service';
import { buildTextMap, caretOffset, flatOffsetOf, pointAt, rangeFor, tokenize, type Token } from '../tokenizer';
import { acquireHighlights, AUTOCORRECT_HIGHLIGHT, browserHighlightEnv, type HighlightEnv } from './highlights';
import { openPopover, type PopoverHandle } from './popover';

/** Browser seams, replaceable in tests (jsdom has no highlights, layout or editing). */
export interface ComposerEnv {
  highlights: HighlightEnv;
  /** The single text-change path: replace `range` with `text` as a native, undoable edit. */
  replace(range: Range, text: string): void;
  rectOf(range: Range): DOMRect;
}

export interface AssistEvent {
  type: 'autocorrect' | 'revert' | 'accept' | 'ignore';
  lang: Lang;
  original: string;
  replacement?: string;
}

export interface AttachOptions {
  service: SpellService;
  /** Effective mode; for `off`, don't attach. */
  mode?: 'suggest' | 'auto';
  languages?: Lang[];
  /** Admin custom dictionary: never auto-corrected. */
  customWords?: string[];
  /** Receives assistance events; nothing is stored or sent by the layer itself. */
  onEvent?: (event: AssistEvent) => void;
  debounceMs?: number;
  /** Keyboard shortcut that opens suggestions for the word at the caret. */
  shortcut?: string;
  /** How long an auto-correction stays highlighted. */
  flashMs?: number;
  env?: Partial<ComposerEnv>;
}

export interface SpellCheckHandle {
  detach(): void;
  /** Runs a check now instead of waiting for the debounce (tests, demos). */
  recheck(): Promise<void>;
  /** Resolves when any in-flight auto-correction has finished (tests, demos). */
  settled(): Promise<void>;
}

interface Correction {
  /** Live range over the replacement text. */
  range: Range;
  original: string;
  replacement: string;
  lang: Lang;
  /** Flat offset where the word starts: the anchor for detecting an Undo. */
  flatStart: number;
}

function browserEnv(el: HTMLElement, overrides: Partial<ComposerEnv> = {}): ComposerEnv {
  const doc = el.ownerDocument;
  return {
    highlights: overrides.highlights ?? browserHighlightEnv(doc),
    replace:
      overrides.replace ??
      ((range, text) => {
        el.focus();
        const sel = doc.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        // execCommand is deprecated but is still the only API that creates a
        // native undo step and fires beforeinput/input for host editors (GWT).
        doc.execCommand('insertText', false, text);
      }),
    rectOf: overrides.rectOf ?? ((range) => range.getClientRects()[0] ?? range.getBoundingClientRect()),
  };
}

function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === parts.includes('ctrl') &&
    e.altKey === parts.includes('alt') &&
    e.shiftKey === parts.includes('shift') &&
    e.metaKey === (parts.includes('meta') || parts.includes('cmd'))
  );
}

const keyOf = (t: { lang: Lang; text: string }) => `${t.lang}:${t.text}`;

function containsCaret(range: Range, sel: Selection | null): boolean {
  if (!sel?.isCollapsed || !sel.anchorNode) return false;
  try {
    return range.isPointInRange(sel.anchorNode, sel.anchorOffset);
  } catch {
    return false;
  }
}

/**
 * Spell checking for a contenteditable composer. `suggest` underlines
 * misspelled settled words and lets the agent pick a fix; `auto` additionally
 * replaces clear slips when the agent types a boundary after them. Every
 * automatic change is flashed and revertible.
 */
export function attachSpellCheck(el: HTMLElement, options: AttachOptions): SpellCheckHandle {
  const {
    service,
    mode = 'suggest',
    languages = ['en', 'ar'],
    debounceMs = 150,
    shortcut = 'Ctrl+.',
    flashMs = 2000,
  } = options;
  const customWords = new Set(options.customWords ?? []);
  const emit = (e: AssistEvent) => options.onEvent?.(e);

  const doc = el.ownerDocument;
  const env = browserEnv(el, options.env);
  const highlights = acquireHighlights(env.highlights);
  const flash = acquireHighlights(env.highlights, AUTOCORRECT_HIGHLIGHT);
  const flashing = new Set<Range>();
  const flashTimers = new Set<ReturnType<typeof setTimeout>>();
  const originalSpellcheck = el.getAttribute('spellcheck');
  const ignored = new Set<string>();
  let corrections: Correction[] = [];
  let flagged: Token[] = [];
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let popover: PopoverHandle | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  let handedOver = false;
  let detached = false;

  const handOver = () => {
    if (handedOver || !languages.some((l) => service.isReady(l))) return;
    handedOver = true;
    el.setAttribute('spellcheck', 'false');
  };

  const checkable = (t: Token) => languages.includes(t.lang) && service.isReady(t.lang) && !ignored.has(keyOf(t));

  async function recheck(): Promise<void> {
    clearTimeout(timer);
    if (detached) return;
    const mine = ++generation;
    const map = buildTextMap(el);
    const tokens = tokenize(map, caretOffset(map, doc.getSelection())).filter(checkable);

    const unknown: Partial<Record<Lang, string[]>> = {};
    for (const t of tokens) {
      if (!t.pending && service.misspelled(t.lang, t.text) === undefined) (unknown[t.lang] ??= []).push(t.text);
    }
    if (Object.keys(unknown).length) await service.check(unknown);
    if (mine !== generation || detached) return; // a newer check superseded this one

    // A pending word keeps an underline it already had (same text, same place),
    // so clicking into a flagged word doesn't hide it; it gets no new one.
    const previously = new Set(flagged.map((t) => `${t.start}:${keyOf(t)}`));
    flagged = tokens.filter(
      (t) => service.misspelled(t.lang, t.text) === true && (!t.pending || previously.has(`${t.start}:${keyOf(t)}`)),
    );
    highlights.setRanges(flagged.map((t) => t.range));
    // A correction the agent has since edited can no longer be reverted.
    corrections = corrections.filter((c) => c.range.toString() === c.replacement);
  }

  const schedule = () => {
    if (detached) return;
    clearTimeout(timer);
    timer = setTimeout(() => void recheck(), debounceMs);
  };

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

  /** The word a typed boundary just completed, captured synchronously at the input event. */
  function completedAt(e: InputEvent): Token | undefined {
    const map = buildTextMap(el);
    const caret = caretOffset(map, doc.getSelection());
    const token = completedWord(e, map, caret, tokenize(map, caret).filter(checkable));
    return token && !customWords.has(token.text) ? token : undefined;
  }

  /** Auto mode: replaces the completed word if it is a clear slip. */
  async function autoCorrect(token: Token) {
    const { text: word, lang } = token;

    await service.check({ [lang]: [word] });
    if (service.misspelled(lang, word) !== true) return;
    const suggestions = await service.suggest(lang, word);
    const fix = decide(word, lang, suggestions, { ignored, customWords });
    // Re-validate: the agent may have edited the word, or sent the message, meanwhile.
    if (!fix || detached || !el.isConnected || token.range.toString() !== word) return;

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
    emit({ type: 'autocorrect', lang, original: word, replacement: fix });
    schedule();
  }

  /** An Undo that restored an auto-corrected word counts as a revert. */
  function detectUndoRevert() {
    const tokens = tokenize(buildTextMap(el));
    corrections = corrections.filter((c) => {
      if (c.range.toString() === c.replacement) return true; // still stands
      if (tokens.some((t) => t.start === c.flatStart && t.text === c.original && t.lang === c.lang)) {
        ignored.add(keyOf({ lang: c.lang, text: c.original }));
        emit({ type: 'revert', lang: c.lang, original: c.original, replacement: c.replacement });
      }
      return false;
    });
  }

  function revert(c: Correction) {
    if (c.range.toString() !== c.replacement) return;
    corrections = corrections.filter((x) => x !== c);
    ignored.add(keyOf({ lang: c.lang, text: c.original }));
    env.replace(c.range, c.original);
    emit({ type: 'revert', lang: c.lang, original: c.original, replacement: c.replacement });
    void recheck();
  }

  const onInput = (e: Event) => {
    schedule();
    const ie = e as InputEvent;
    if (ie.inputType === 'historyUndo') detectUndoRevert();
    if (mode !== 'auto') return;
    // Capture the word now: by the time earlier corrections finish, the caret
    // may already be several words further on.
    const token = completedAt(ie);
    if (token) inFlight = inFlight.then(() => autoCorrect(token)).catch(() => {});
  };

  /** The standing auto-correction containing the collapsed caret, if any. */
  const correctionAtCaret = () =>
    corrections.find((c) => c.range.toString() === c.replacement && containsCaret(c.range, doc.getSelection()));

  /** The flagged word containing the collapsed caret, if any. */
  function flaggedAtCaret(): Token | undefined {
    const sel = doc.getSelection();
    if (!sel?.anchorNode || !el.contains(sel.anchorNode)) return undefined;
    return flagged.find((t) => containsCaret(t.range, sel));
  }

  function openAt(range: Range, lang: Lang, extra: Partial<Parameters<typeof openPopover>[0]>) {
    popover?.close();
    const saved = doc.getSelection()?.rangeCount ? doc.getSelection()!.getRangeAt(0).cloneRange() : undefined;
    popover = openPopover({
      document: doc,
      anchor: env.rectOf(range),
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      suggestions: [],
      font: doc.defaultView?.getComputedStyle(el).font,
      onPick: () => {},
      onIgnore: () => {},
      onClose: (restoreFocus) => {
        popover = undefined;
        if (restoreFocus && saved) {
          el.focus();
          const sel = doc.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(saved);
        }
      },
      ...extra,
    });
  }

  async function showSuggestions(token: Token) {
    const suggestions = await service.suggest(token.lang, token.text);
    if (detached || token.range.toString() !== token.text) return;
    openAt(token.range, token.lang, {
      suggestions,
      onPick: (s) => accept(token, s),
      onIgnore: () => {
        ignored.add(keyOf(token));
        emit({ type: 'ignore', lang: token.lang, original: token.text });
        void recheck();
      },
    });
  }

  function accept(token: Token, suggestion: string) {
    if (token.range.toString() !== token.text) return; // the word changed since the popover opened
    env.replace(token.range, suggestion);
    emit({ type: 'accept', lang: token.lang, original: token.text, replacement: suggestion });
    void recheck();
  }

  function openForCaret(): boolean {
    if (doc.querySelector('[data-bp-polish-panel]')) return false; // never two panels at once
    const c = correctionAtCaret();
    if (c) {
      openAt(c.range, c.lang, { revert: { original: c.original, onRevert: () => revert(c) } });
      return true;
    }
    const token = flaggedAtCaret();
    if (token) {
      void showSuggestions(token);
      return true;
    }
    return false;
  }

  // Let the click settle the caret first.
  const onMouseUp = () => setTimeout(openForCaret, 0);
  const onKeyDown = (e: KeyboardEvent) => {
    if (matchesShortcut(e, shortcut) && openForCaret()) e.preventDefault();
  };
  const onSelectionChange = () => {
    const sel = doc.getSelection();
    if (sel?.anchorNode && el.contains(sel.anchorNode)) schedule();
  };

  // Host writes that fire no input event (e.g. GWT clearing the composer on send).
  const observer = new MutationObserver(schedule);
  observer.observe(el, { characterData: true, childList: true, subtree: true });
  el.addEventListener('input', onInput);
  el.addEventListener('mouseup', onMouseUp);
  el.addEventListener('keydown', onKeyDown);
  doc.addEventListener('selectionchange', onSelectionChange);
  const unsubscribe = service.onStatus(() => {
    handOver();
    schedule();
  });
  handOver();
  schedule();

  return {
    recheck,
    settled: () => inFlight,
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
      unsubscribe();
      popover?.close();
      highlights.release();
      flash.release();
      if (originalSpellcheck === null) el.removeAttribute('spellcheck');
      else el.setAttribute('spellcheck', originalSpellcheck);
    },
  };
}
