import type { AutoReplaceConfidence } from '../autocorrect/confidence';
import type { SpellChecker } from '../spell/checker';
import type { Lang } from '../spell/protocol';
import { createCompletion } from './completion';
import { detectMac } from './completion-rules';
import { browserHighlights } from './highlights';
import { createPolish } from './polish';
import type { Server, Turn } from './server';
import { createSpelling } from './spelling';
import { INITIAL_STATE, type AssistantEnv, type AssistantState, type AssistEvent, type Rect, type Shared } from './state';

export type { AssistantState, AssistEvent } from './state';

export interface AssistantOptions {
  checker: SpellChecker;
  /** off; suggest: underline and offer fixes; auto: also auto-correct. */
  spelling: 'off' | 'suggest' | 'auto';
  autoReplace: AutoReplaceConfidence;
  languages: Lang[];
  customWords: string[];
  completion: boolean;
  /** Canned responses and KB articles ("Title: body") sent with completion requests. */
  canned: string[];
  kb: string[];
  /** The conversation, read on every use. */
  conversation: () => Turn[];
  log?: (event: AssistEvent) => void;
  server: Server;
  /** Tests replace the browser parts. */
  env?: Partial<AssistantEnv>;
  spellingDebounceMs?: number;
  completionDebounceMs?: number;
}

export type Assistant = ReturnType<typeof createAssistant>;

/**
 * Spell check, auto-correct, inline completion and polish for one
 * contenteditable message field. It handles the field's events and keeps the
 * state of what to draw around it (popover, ghost text, polish preview); the
 * page subscribes and draws it.
 */
export function createAssistant(el: HTMLElement, options: AssistantOptions) {
  let state: AssistantState = INITIAL_STATE;
  const listeners = new Set<() => void>();
  const { server } = options;
  const shared: Shared = {
    el,
    env: browserEnv(el, options.env),
    log: (event) => options.log?.(event),
    getState: () => state,
    setState(patch) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
  };

  const spelling =
    options.spelling === 'off'
      ? undefined
      : createSpelling(shared, {
          checker: options.checker,
          mode: options.spelling,
          autoReplace: options.autoReplace,
          languages: options.languages,
          customWords: options.customWords,
          conversation: options.conversation,
          debounceMs: options.spellingDebounceMs,
        });
  const completion = options.completion
    ? createCompletion(shared, {
        server,
        conversation: options.conversation,
        canned: options.canned,
        kb: options.kb,
        debounceMs: options.completionDebounceMs,
      })
    : undefined;
  const polish = createPolish(shared, {
    server,
    onStart() {
      completion?.dismiss();
      spelling?.closePopover();
    },
  });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // Popover choices.
    pickSuggestion: (suggestion: string) => spelling?.pick(suggestion),
    ignoreWord: () => spelling?.ignore(),
    revertCorrection: () => spelling?.revert(),
    closePopover: (restoreFocus: boolean) => spelling?.closePopover(restoreFocus),
    // Polish.
    polishNow: () => polish.polishNow(),
    acceptPolish: () => polish.accept(),
    dismissPolish: () => polish.dismiss(),
    revertPolish: () => polish.revert(),
    /** The features themselves, for tests. */
    spelling,
    completion,
    detach() {
      spelling?.detach();
      completion?.detach();
      polish.detach();
      listeners.clear();
    },
  };
}

const toRect = (r: DOMRect): Rect => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });

function browserEnv(el: HTMLElement, overrides: Partial<AssistantEnv> = {}): AssistantEnv {
  const doc = el.ownerDocument;
  return {
    replace:
      overrides.replace ??
      ((range, text) => {
        el.focus();
        const sel = doc.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        // execCommand is deprecated but still the only API that makes a native
        // undo step and fires the input event a user's typing would.
        doc.execCommand('insertText', false, text);
      }),
    highlights: overrides.highlights ?? browserHighlights(),
    rectOf: overrides.rectOf ?? ((range) => toRect(range.getClientRects()[0] ?? range.getBoundingClientRect())),
    caretRect:
      overrides.caretRect ??
      ((field) => {
        const sel = doc.getSelection();
        if (!sel?.anchorNode || !field.contains(sel.anchorNode)) return null;
        const range = doc.createRange();
        const node = sel.anchorNode;
        if (node.nodeType === Node.TEXT_NODE && sel.anchorOffset > 0) {
          // A collapsed range at a line end can report an empty rect; the
          // previous character's box is reliable.
          range.setStart(node, sel.anchorOffset - 1);
          range.setEnd(node, sel.anchorOffset);
          const rects = range.getClientRects();
          return rects.length ? toRect(rects[rects.length - 1]) : null;
        }
        range.setStart(node, sel.anchorOffset);
        const r = range.getBoundingClientRect();
        return r.height ? toRect(r) : null;
      }),
    contentBox:
      overrides.contentBox ??
      ((field) => {
        const r = field.getBoundingClientRect();
        const cs = doc.defaultView!.getComputedStyle(field);
        const px = (v: string) => parseFloat(v) || 0;
        return {
          left: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
          right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight),
          top: r.top + px(cs.borderTopWidth),
          bottom: r.bottom - px(cs.borderBottomWidth),
        };
      }),
    isMac: overrides.isMac ?? detectMac(doc.defaultView?.navigator),
  };
}
