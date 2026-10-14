import { vi } from 'vitest';
import { createAssistant, type AssistantOptions } from '../../src/assistant';
import type { HighlightEnv, HighlightLike } from '../../src/assistant/highlights';
import type { Server } from '../../src/assistant/server';
import type { AssistEvent, AssistantEnv } from '../../src/assistant/state';
import type { SpellChecker, SpellStatus } from '../../src/spell/checker';
import type { Lang } from '../../src/spell/protocol';

/** A fake CSS highlight registry; `words()` lists what the spelling underline paints. */
export function fakeHighlightEnv() {
  const registered = new Map<string, Set<Range>>();
  const env: HighlightEnv = {
    registry: {
      set: (name: string, h: HighlightLike) => registered.set(name, h as unknown as Set<Range>),
      delete: (name: string) => registered.delete(name),
    },
    createHighlight: () => new Set<Range>() as unknown as HighlightLike,
  };
  const ranges = (name = 'bp-spelling-error') => [...(registered.get(name) ?? [])];
  return { env, registered, ranges, words: () => ranges().map((r) => r.toString()) };
}

const SUGGESTIONS: Record<string, string[]> = {
  recieve: ['receive', 'relieve'],
  seperate: ['separate', 'desperate'],
  Seperate: ['separate'],
  paymnet: ['payment'],
  النضام: ['النظام'],
  اذا: ['إذا'],
  التامينات: ['التأمينات', 'التضمينات'],
  المستخذم: ['المستخدم'],
  حتىى: ['حتى'],
  afte: ['fate', 'aft', 'ate', 'after', 'ante'],
  teh: ['the', 'eh', 'tech'],
  الى: ['ألى', 'إلى'],
};

// One-edit dictionary neighbors, as the real engine reports them (abridged
// where the real list is long; only the count matters for the decision).
const NEIGHBORS: Record<string, string[]> = {
  recieve: ['receive', 'relieve'],
  seperate: ['separate'],
  Seperate: ['separate'],
  paymnet: ['payment'],
  النضام: ['الضام', 'النظام', 'لنضام'],
  اذا: ['إذا', 'ذا', 'هذا'],
  التامينات: ['التأمينات', 'التضمينات'],
  المستخذم: ['المستخدم'],
  حتىى: ['حتى'],
  gosi: ['gosh'],
  // Hypothetical (the real engine has none): makes "https:" a fixable word, as
  // it was when suggest() offered "HTTP", so the URL test can catch a leak.
  https: ['http'],
  info: ['inf', 'into'],
  oNly: ['oily'],
  afte: ['after', 'aft', 'ate', 'fate', 'ante'],
  tge: ['the', 'toe', 'tie'],
  // Names: one neighbor each, so only the name guards keep them unchanged.
  Fatimah: ['fatima'],
  Harbi: ['harbin'],
  Noura: ['nora'],
  نوره: ['نور'],
  Almarai: ['almaria'],
  ان: ['أن', 'إن', 'آن'],
};

/** In-memory SpellChecker: words listed in `bad` are misspelled. */
export function fakeChecker(bad: Record<string, string[]>, ready: Lang[] = ['en', 'ar']) {
  const listeners = new Set<(s: SpellStatus) => void>();
  const readySet = new Set<Lang>(ready);
  const checked: Partial<Record<Lang, string[]>>[] = [];
  const known = new Map<string, boolean>();
  const neighborRequests: string[] = [];
  let hold: Promise<void> | undefined;
  const status = (): SpellStatus => ({
    state: readySet.size ? 'ready' : 'loading',
    loaded: [...readySet].map((lang) => ({ lang, ms: 1 })),
    failed: [],
    pending: [],
  });
  const checker: SpellChecker = {
    get status() {
      return status();
    },
    onStatus(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isReady: (lang) => readySet.has(lang),
    misspelled: (lang, word) => known.get(`${lang}:${word}`),
    async check(words) {
      checked.push(words);
      if (hold) await hold;
      for (const [lang, list] of Object.entries(words) as [Lang, string[]][]) {
        for (const w of list) known.set(`${lang}:${w}`, (bad[lang] ?? []).includes(w));
      }
    },
    suggest: async (lang, word) => SUGGESTIONS[word] ?? (lang === 'ar' ? ['إذا'] : []),
    neighbors: async (_lang, word) => {
      neighborRequests.push(word);
      return NEIGHBORS[word] ?? [];
    },
    terminate: () => {},
  };
  return {
    checker,
    checked,
    neighborRequests,
    makeReady(lang: Lang) {
      readySet.add(lang);
      listeners.forEach((l) => l(status()));
    },
    holdChecks() {
      let release!: () => void;
      hold = new Promise((r) => (release = r));
      return () => {
        hold = undefined;
        release();
      };
    },
  };
}

/** A server that never answers (completion and polish tests pass their own). */
export const silentServer: Server = { complete: async () => null, polish: async () => null };

/**
 * An assistant on `el` with test defaults: spelling in suggest mode, no
 * completion, fake browser parts (highlights, rects, a no-op replace), events
 * collected in `events`. Override anything through `options`.
 */
export function testAssistant(el: HTMLElement, options: Partial<AssistantOptions> & { env?: Partial<AssistantEnv> } = {}) {
  const hl = fakeHighlightEnv();
  const events: AssistEvent[] = [];
  const replace = vi.fn<AssistantEnv['replace']>();
  const assistant = createAssistant(el, {
    checker: options.checker ?? fakeChecker({}).checker,
    spelling: 'suggest',
    autoReplace: 'list-and-rule',
    languages: ['en', 'ar'],
    customWords: [],
    completion: false,
    canned: [],
    kb: [],
    conversation: () => [],
    log: (e) => events.push(e),
    server: silentServer,
    spellingDebounceMs: 1,
    completionDebounceMs: 5,
    ...options,
    env: {
      highlights: hl.env,
      replace,
      rectOf: () => ({ left: 10, top: 10, right: 50, bottom: 26 }),
      caretRect: () => ({ left: 200, top: 60, right: 208, bottom: 78 }),
      contentBox: () => ({ left: 100, right: 500, top: 50, bottom: 110 }),
      isMac: false,
      ...options.env,
    },
  });
  return { assistant, hl, events, replace };
}

export function field(html = '') {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
}

export function placeCaret(node: Node, offset: number) {
  document.getSelection()!.collapse(node, offset);
}

/**
 * Stand-in for execCommand('insertText') over a range inside one text node:
 * really edits the text (so live Ranges move), leaves the caret after the
 * insertion, and fires the input event a browser would.
 */
export function textReplace(el: HTMLElement) {
  return (range: Range, text: string) => {
    const node = range.startContainer as Text;
    node.replaceData(range.startOffset, range.endOffset - range.startOffset, text);
    document.getSelection()!.collapse(node, range.startOffset + text.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
  };
}

/** Types `chars` at the end of the composer's last text node, one input event per character. */
export function typeChars(el: HTMLElement, chars: string) {
  for (const ch of chars) {
    let node = el.lastChild as Text | null;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      node = document.createTextNode('');
      el.append(node);
    }
    node.appendData(ch);
    document.getSelection()!.collapse(node, node.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch }));
  }
}
