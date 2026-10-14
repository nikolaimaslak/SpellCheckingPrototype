import { caseFolded, decide, needsEvidence, withLeadingCapital, type AutoReplaceConfidence } from '../autocorrect/confidence';
import { knownFix } from '../autocorrect/misspellings';
import { conversationWords, startsSentence } from '../autocorrect/context';
import { boundaryKind, completedWord, releasable } from '../autocorrect/trigger';
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
  type: 'flag' | 'unresolved' | 'autocorrect' | 'revert' | 'accept' | 'ignore';
  lang: Lang;
  original: string;
  replacement?: string;
  /** accept: the chosen suggestion's 1-based position, and how many were shown. */
  rank?: number;
  offered?: number;
}


export interface AttachOptions {
  service: SpellService;
  /** Effective mode; for `off`, don't attach. */
  mode?: 'suggest' | 'auto';
  /** Admin's auto-replace confidence: only known misspellings, or also the general rules (default). */
  autoReplace?: AutoReplaceConfidence;
  languages?: Lang[];
  /** Admin custom dictionary: never auto-corrected. */
  customWords?: string[];
  /**
   * The conversation so far; words in the customer's turns are never
   * auto-replaced (names, Req 4.2.2). Read in the page only, never sent.
   */
  conversation?: () => readonly { role: string; text: string }[];
  /** Receives assistance events; nothing is stored or sent by the layer itself. */
  onEvent?: (event: AssistEvent) => void;
  debounceMs?: number;
  /** Keyboard shortcut that opens suggestions for the word at the caret. */
  shortcut?: string;
  /** How long an auto-correction stays highlighted. */
  flashMs?: number;
  /** Backspace right after an auto-correction restores the original word (default true). Undo always does. */
  backspaceRevert?: boolean;
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
/** What may lie between a corrected word and the caret for Backspace to revert it: the trigger (as in trigger.ts). */
const TRIGGER_GAP = /^[\s\p{P}￼]{1,3}$/u;

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
    autoReplace = 'list-and-rule',
    languages = ['en', 'ar'],
    debounceMs = 150,
    shortcut = 'Ctrl+.',
    flashMs = 2000,
    backspaceRevert: backspaceReverts = true,
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
  /** Words completed by . @ : / whose decision waits for whitespace (KI-2). */
  let held: Token[] = [];
  let flagged: Token[] = [];
  /** Words already reported as `flag` in this message (lang:text). */
  const reported = new Set<string>();
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let popover: PopoverHandle | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  /** The correction that just landed, while Backspace may still revert it (Req 4.2.1). */
  let justCorrected: { correction: Correction; text: string; caret: number } | undefined;
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
    if (!map.text.trim()) {
      // Sent or cleared: words still underlined in the last check were left misspelled.
      const left = new Set<string>();
      for (const t of flagged) {
        if (!left.has(keyOf(t))) {
          left.add(keyOf(t));
          emit({ type: 'unresolved', lang: t.lang, original: t.text });
        }
      }
      // Nothing is waiting any more, and the next message reports its own flags.
      flagged = [];
      held = [];
      reported.clear();
    }
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
    for (const t of flagged) {
      if (!reported.has(keyOf(t))) {
        reported.add(keyOf(t));
        emit({ type: 'flag', lang: t.lang, original: t.text });
      }
    }
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

  /**
   * The words a typed boundary makes ready for a decision, captured
   * synchronously at the input event. A word completed by . @ : / is held
   * until whitespace, then decided only if it isn't part of an address.
   */
  function wordsToDecide(e: InputEvent): Token[] {
    const kind = boundaryKind(e);
    if (kind === 'none') return [];
    const map = buildTextMap(el);
    const caret = caretOffset(map, doc.getSelection());
    const tokens = tokenize(map, caret).filter(checkable);
    const done = completedWord(e, map, caret, tokens);
    const word = done && !customWords.has(done.text) ? done : undefined;
    if (kind === 'decide') return word ? [word] : [];
    if (kind === 'hold') {
      if (word && !held.some((h) => h.start === word.start && h.text === word.text)) held.push(word);
      return [];
    }
    const waiting = held.map((h) => ({ start: flatOffsetOf(map, h.range.startContainer, h.range.startOffset), text: h.text }));
    held = [];
    const ready = caret === undefined ? [] : releasable(waiting, map.text, caret, tokens);
    if (word && !ready.some((t) => t.start === word.start)) ready.push(word);
    return ready.sort((a, b) => a.start - b.start);
  }

  /** Auto mode: replaces the completed word if it is a clear slip. */
  async function autoCorrect(token: Token) {
    const { text: word, lang } = token;

    await service.check({ [lang]: [word] });
    if (service.misspelled(lang, word) !== true) return;
    // A known misspelling, or list-only confidence, needs no engine evidence.
    let caseFix: string | null = null;
    let neighbors: string[] = [];
    if (needsEvidence(word, lang, autoReplace)) {
      const folded = caseFolded(word, lang);
      if (folded) await service.check({ [lang]: [folded] });
      caseFix = folded && service.misspelled(lang, folded) === false ? folded : null;
      if (!caseFix) neighbors = await service.neighbors(lang, word);
    }
    const now = buildTextMap(el);
    const context = {
      ignored,
      customWords,
      confidence: autoReplace,
      startsSentence: startsSentence(now.text, flatOffsetOf(now, token.range.startContainer, token.range.startOffset)),
      conversation: options.conversation ? conversationWords(options.conversation()) : undefined,
    };
    const fix = decide(word, lang, { neighbors, caseFix }, context)?.fix;
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
    const correction: Correction = { range, original: word, replacement: fix, lang, flatStart: start };
    corrections.push(correction);
    // Set after replace(): its own input event must not clear it.
    const caretNow = caretOffset(after, doc.getSelection());
    justCorrected = caretNow === undefined ? undefined : { correction, text: after.text, caret: caretNow };
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

  /**
   * Backspace as the very next key after a correction, with only its trigger
   * between the corrected word and the caret: restore the original word, keep
   * the trigger and the caret where they are.
   */
  function backspaceRevert(): boolean {
    const j = justCorrected;
    justCorrected = undefined;
    if (!j || j.correction.range.toString() !== j.correction.replacement) return false;
    const sel = doc.getSelection();
    if (!sel?.isCollapsed) return false;
    const map = buildTextMap(el);
    const caret = caretOffset(map, sel);
    const end = j.correction.flatStart + j.correction.replacement.length;
    if (caret !== j.caret || map.text !== j.text || !TRIGGER_GAP.test(map.text.slice(end, caret))) return false;
    const { original, replacement } = j.correction;
    revert(j.correction);
    const after = buildTextMap(el);
    const p = pointAt(after, caret + original.length - replacement.length);
    doc.getSelection()?.collapse(p.node, p.offset);
    return true;
  }

  const onInput = (e: Event) => {
    justCorrected = undefined;
    schedule();
    const ie = e as InputEvent;
    if (ie.inputType === 'historyUndo') detectUndoRevert();
    if (mode !== 'auto') return;
    // Capture the word now: by the time earlier corrections finish, the caret
    // may already be several words further on.
    for (const token of wordsToDecide(ie)) inFlight = inFlight.then(() => autoCorrect(token)).catch(() => {});
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
    const engine = await service.suggest(token.lang, token.text);
    if (detached || token.range.toString() !== token.text) return;
    // A known misspelling's fix leads, then the engine's suggestions.
    const listed = knownFix(token.text, token.lang);
    const known = listed && withLeadingCapital(token.text, listed);
    const suggestions = known ? [known, ...engine.filter((s) => s !== known)] : engine;
    openAt(token.range, token.lang, {
      suggestions,
      onPick: (s) => accept(token, s, suggestions.indexOf(s) + 1, suggestions.length),
      onIgnore: () => {
        ignored.add(keyOf(token));
        emit({ type: 'ignore', lang: token.lang, original: token.text });
        void recheck();
      },
    });
  }

  function accept(token: Token, suggestion: string, rank?: number, offered?: number) {
    if (token.range.toString() !== token.text) return; // the word changed since the popover opened
    env.replace(token.range, suggestion);
    emit({ type: 'accept', lang: token.lang, original: token.text, replacement: suggestion, rank, offered });
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
  const onMouseDown = () => (justCorrected = undefined);
  // Capture phase on the window, so the host's own key handlers never see a reverting Backspace.
  const onBackspace = (e: KeyboardEvent) => {
    if (!justCorrected || !el.contains(e.target as Node)) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    if (e.key === 'Backspace' && plain && backspaceRevert()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    justCorrected = undefined;
  };
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
  el.addEventListener('mousedown', onMouseDown);
  if (backspaceReverts) doc.defaultView?.addEventListener('keydown', onBackspace, true);
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
      el.removeEventListener('mousedown', onMouseDown);
      doc.defaultView?.removeEventListener('keydown', onBackspace, true);
      justCorrected = undefined;
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
