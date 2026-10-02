import type { Lang } from '../spell/protocol';
import type { SpellService } from '../spell/service';
import { buildTextMap, caretOffset, tokenize, type Token } from '../tokenizer';
import { acquireHighlights, browserHighlightEnv, type HighlightEnv } from './highlights';
import { openPopover, type PopoverHandle } from './popover';

/** Browser seams, replaceable in tests (jsdom has no highlights, layout or editing). */
export interface ComposerEnv {
  highlights: HighlightEnv;
  /** The single text-change path: replace `range` with `text` as a native, undoable edit. */
  replace(range: Range, text: string): void;
  rectOf(range: Range): DOMRect;
}

export interface AttachOptions {
  service: SpellService;
  languages?: Lang[];
  enabled?: boolean;
  debounceMs?: number;
  /** Keyboard shortcut that opens suggestions for the word at the caret. */
  shortcut?: string;
  env?: Partial<ComposerEnv>;
}

export interface SpellCheckHandle {
  detach(): void;
  /** Runs a check now instead of waiting for the debounce (tests, demos). */
  recheck(): Promise<void>;
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

/**
 * Suggest-only spell checking for a contenteditable composer: underlines
 * misspelled settled words and lets the agent pick a fix. Never changes text
 * unless the agent accepts a suggestion.
 */
export function attachSpellCheck(el: HTMLElement, options: AttachOptions): SpellCheckHandle {
  const { service, languages = ['en', 'ar'], enabled = true, debounceMs = 150, shortcut = 'Ctrl+.' } = options;
  if (!enabled) return { detach() {}, recheck: async () => {} };

  const doc = el.ownerDocument;
  const env = browserEnv(el, options.env);
  const highlights = acquireHighlights(env.highlights);
  const originalSpellcheck = el.getAttribute('spellcheck');
  const ignored = new Set<string>();
  let flagged: Token[] = [];
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let popover: PopoverHandle | undefined;
  let handedOver = false;
  let detached = false;

  const handOver = () => {
    if (handedOver || !languages.some((l) => service.isReady(l))) return;
    handedOver = true;
    el.setAttribute('spellcheck', 'false');
  };

  async function recheck(): Promise<void> {
    clearTimeout(timer);
    if (detached) return;
    const mine = ++generation;
    const map = buildTextMap(el);
    const tokens = tokenize(map, caretOffset(map, doc.getSelection())).filter(
      (t) => languages.includes(t.lang) && service.isReady(t.lang) && !ignored.has(keyOf(t)),
    );

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
  }

  const schedule = () => {
    if (detached) return;
    clearTimeout(timer);
    timer = setTimeout(() => void recheck(), debounceMs);
  };

  /** The flagged word containing the collapsed caret, if any. */
  function flaggedAtCaret(): Token | undefined {
    const sel = doc.getSelection();
    if (!sel?.isCollapsed || !sel.anchorNode || !el.contains(sel.anchorNode)) return undefined;
    return flagged.find((t) => {
      try {
        return t.range.isPointInRange(sel.anchorNode!, sel.anchorOffset);
      } catch {
        return false;
      }
    });
  }

  async function showSuggestions(token: Token) {
    popover?.close();
    const suggestions = await service.suggest(token.lang, token.text);
    if (detached || token.range.toString() !== token.text) return;
    const saved = doc.getSelection()?.rangeCount ? doc.getSelection()!.getRangeAt(0).cloneRange() : undefined;
    popover = openPopover({
      document: doc,
      anchor: env.rectOf(token.range),
      dir: token.lang === 'ar' ? 'rtl' : 'ltr',
      suggestions,
      font: doc.defaultView?.getComputedStyle(el).font,
      onPick: (s) => accept(token, s),
      onIgnore: () => {
        ignored.add(keyOf(token));
        void recheck();
      },
      onClose: (restoreFocus) => {
        popover = undefined;
        if (restoreFocus && saved) {
          el.focus();
          const sel = doc.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(saved);
        }
      },
    });
  }

  function accept(token: Token, suggestion: string) {
    if (token.range.toString() !== token.text) return; // the word changed since the popover opened
    env.replace(token.range, suggestion);
    void recheck();
  }

  const onMouseUp = () => {
    // Let the click settle the caret first.
    setTimeout(() => {
      const token = flaggedAtCaret();
      if (token) void showSuggestions(token);
    }, 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!matchesShortcut(e, shortcut)) return;
    const token = flaggedAtCaret();
    if (!token) return;
    e.preventDefault();
    void showSuggestions(token);
  };
  const onSelectionChange = () => {
    const sel = doc.getSelection();
    if (sel?.anchorNode && el.contains(sel.anchorNode)) schedule();
  };

  // Host writes that fire no input event (e.g. GWT clearing the composer on send).
  const observer = new MutationObserver(schedule);
  observer.observe(el, { characterData: true, childList: true, subtree: true });
  el.addEventListener('input', schedule);
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
    detach() {
      if (detached) return;
      detached = true;
      clearTimeout(timer);
      observer.disconnect();
      el.removeEventListener('input', schedule);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('selectionchange', onSelectionChange);
      unsubscribe();
      popover?.close();
      highlights.release();
      if (originalSpellcheck === null) el.removeAttribute('spellcheck');
      else el.setAttribute('spellcheck', originalSpellcheck);
    },
  };
}
