import { caseFolded, decide, needsEvidence, withLeadingCapital, type AutoReplaceConfidence } from '../autocorrect/confidence';
import { conversationWords, startsSentence } from '../autocorrect/context';
import { knownFix } from '../autocorrect/misspellings';
import { boundaryKind, completedWord, releasable } from '../autocorrect/trigger';
import type { SpellChecker } from '../spell/checker';
import type { Lang } from '../spell/protocol';
import { buildTextMap, caretOffset, flatOffsetOf, pointAt, rangeFor, tokenize, type Token } from '../tokenizer';
import { AUTOCORRECTED, createHighlight, SPELLING_ERROR } from './highlights';
import type { Shared } from './state';

export interface SpellingOptions {
  checker: SpellChecker;
  /** suggest: underline and offer fixes; auto: also replace clear slips when a word is finished. */
  mode: 'suggest' | 'auto';
  autoReplace: AutoReplaceConfidence;
  languages: Lang[];
  /** Never auto-corrected (the checker also never flags them). */
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

/**
 * Spell checking for the message field: underlines misspelled finished words
 * and offers fixes (click or Ctrl+.); in `auto` mode it also replaces clear
 * slips when the agent types a space or punctuation after them. Every
 * automatic change is flashed and undoes with Ctrl/Cmd+Z.
 */
export function createSpelling(shared: Shared, options: SpellingOptions) {
  const { el, env, log } = shared;
  const { checker, mode, autoReplace, languages, debounceMs = 150, flashMs = 2000 } = options;
  const doc = el.ownerDocument;
  const customWords = new Set(options.customWords);
  const underline = createHighlight(env.highlights, SPELLING_ERROR);
  const flash = createHighlight(env.highlights, AUTOCORRECTED);
  const flashing = new Set<Range>();
  const flashTimers = new Set<ReturnType<typeof setTimeout>>();
  const ignored = new Set<string>();
  /** Words already logged as `flag` in this message (lang:text). */
  const reported = new Set<string>();
  let corrections: Correction[] = [];
  /** Words finished by . @ : / whose decision waits for whitespace (KI-2). */
  let held: Token[] = [];
  let flagged: Token[] = [];
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  let popover: { target: PopoverTarget; selection?: Range } | undefined;
  let detached = false;

  // The browser's own spell check would underline the same words twice.
  const originalSpellcheck = el.getAttribute('spellcheck');
  el.setAttribute('spellcheck', 'false');

  const checkable = (t: Token) => languages.includes(t.lang) && checker.isReady(t.lang) && !ignored.has(keyOf(t));

  async function recheck(): Promise<void> {
    clearTimeout(timer);
    if (detached) return;
    const mine = ++generation;
    const map = buildTextMap(el);
    if (!map.text.trim()) {
      // Sent or cleared: the next message logs its own flags.
      flagged = [];
      held = [];
      reported.clear();
    }
    const tokens = tokenize(map, caretOffset(map, doc.getSelection())).filter(checkable);

    const unknown: Partial<Record<Lang, string[]>> = {};
    for (const t of tokens) {
      if (!t.pending && checker.misspelled(t.lang, t.text) === undefined) (unknown[t.lang] ??= []).push(t.text);
    }
    if (Object.keys(unknown).length) await checker.check(unknown);
    if (mine !== generation || detached) return; // a newer check superseded this one

    // A word still being typed keeps an underline it already had (same text,
    // same place), so clicking into a flagged word doesn't hide it.
    const previously = new Set(flagged.map((t) => `${t.start}:${keyOf(t)}`));
    flagged = tokens.filter((t) => checker.misspelled(t.lang, t.text) === true && (!t.pending || previously.has(`${t.start}:${keyOf(t)}`)));
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
   * The words a typed space or punctuation makes ready for a decision,
   * captured at the input event. A word finished by . @ : / is held until
   * whitespace, then decided only if it isn't part of an address.
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

  /** Replaces the finished word if it is a clear slip (the rules are in autocorrect/confidence.ts). */
  async function autoCorrect(token: Token) {
    const { text: word, lang } = token;
    await checker.check({ [lang]: [word] });
    if (checker.misspelled(lang, word) !== true) return;
    // A known misspelling, or list-only confidence, needs no engine evidence.
    let caseFix: string | null = null;
    let neighbors: string[] = [];
    if (needsEvidence(word, lang, autoReplace)) {
      const folded = caseFolded(word, lang);
      if (folded) await checker.check({ [lang]: [folded] });
      caseFix = folded && checker.misspelled(lang, folded) === false ? folded : null;
      if (!caseFix) neighbors = await checker.neighbors(lang, word);
    }
    const now = buildTextMap(el);
    const fix = decide(word, lang, { neighbors, caseFix }, {
      ignored,
      customWords,
      confidence: autoReplace,
      startsSentence: startsSentence(now.text, flatOffsetOf(now, token.range.startContainer, token.range.startOffset)),
      conversation: conversationWords(options.conversation()),
    })?.fix;
    // Re-validate: the agent may have edited the word, or sent the message, meanwhile.
    if (!fix || detached || !el.isConnected || token.range.toString() !== word) return;

    const before = buildTextMap(el);
    const start = flatOffsetOf(before, token.range.startContainer, token.range.startOffset);
    const caretBefore = caretOffset(before, doc.getSelection());
    env.replace(token.range, fix);

    // Put the caret back where the agent was typing.
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
    schedule();
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
    void recheck();
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

  async function showSuggestions(token: Token) {
    const engine = await checker.suggest(token.lang, token.text);
    if (detached || token.range.toString() !== token.text) return;
    // A known misspelling's fix leads, then the engine's suggestions.
    const listed = knownFix(token.text, token.lang);
    const known = listed && withLeadingCapital(token.text, listed);
    const suggestions = (known ? [known, ...engine.filter((s) => s !== known)] : engine).slice(0, 5);
    openPopover(token.range, token.lang, { token, suggestions });
  }

  /** Opens the popover for the word at the caret: revert for an auto-correction, suggestions for a flagged word. */
  function openForCaret(): boolean {
    if (shared.getState().polish.preview) return false; // never two panels at once
    const sel = doc.getSelection();
    const correction = corrections.find((c) => c.range.toString() === c.replacement && containsCaret(c.range, sel));
    if (correction) {
      openPopover(correction.range, correction.lang, { correction });
      return true;
    }
    const token = sel?.anchorNode && el.contains(sel.anchorNode) ? flagged.find((t) => containsCaret(t.range, sel)) : undefined;
    if (token) {
      void showSuggestions(token);
      return true;
    }
    return false;
  }

  function pick(suggestion: string) {
    const target = popover?.target;
    closePopover(true);
    if (!target || !('token' in target)) return;
    const { token, suggestions } = target;
    if (token.range.toString() !== token.text) return; // the word changed since the popover opened
    env.replace(token.range, suggestion);
    log({ type: 'accept', lang: token.lang, original: token.text, replacement: suggestion, rank: suggestions.indexOf(suggestion) + 1, offered: suggestions.length });
    void recheck();
  }

  function ignore() {
    const target = popover?.target;
    closePopover(true);
    if (!target || !('token' in target)) return;
    ignored.add(keyOf(target.token));
    log({ type: 'ignore', lang: target.token.lang, original: target.token.text });
    void recheck();
  }

  function revert() {
    const target = popover?.target;
    closePopover(true);
    if (target && 'correction' in target) revertCorrection(target.correction);
  }

  // --- Events --------------------------------------------------------------

  const onInput = (e: Event) => {
    schedule();
    const ie = e as InputEvent;
    if (ie.inputType === 'historyUndo') detectUndoRevert();
    if (mode !== 'auto') return;
    // Capture the words now: by the time earlier corrections finish, the caret
    // may already be several words further on.
    for (const token of wordsToDecide(ie)) inFlight = inFlight.then(() => autoCorrect(token)).catch(() => {});
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
  const unsubscribe = checker.onStatus(schedule);
  schedule();

  return {
    /** Runs a check now instead of waiting for the debounce (tests). */
    recheck,
    /** Resolves when any in-flight auto-correction has finished (tests). */
    settled: () => inFlight,
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
      unsubscribe();
      closePopover();
      underline.release();
      flash.release();
      if (originalSpellcheck === null) el.removeAttribute('spellcheck');
      else el.setAttribute('spellcheck', originalSpellcheck);
    },
  };
}

export type Spelling = ReturnType<typeof createSpelling>;
