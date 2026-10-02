import type { HighlightEnv, HighlightLike } from '../../src/composer/highlights';
import type { Lang } from '../../src/spell/protocol';
import type { SpellService, SpellServiceStatus } from '../../src/spell/service';

export function fakeHighlightEnv() {
  const registered = new Map<string, Set<Range>>();
  const env: HighlightEnv = {
    registry: {
      set: (name: string, h: HighlightLike) => registered.set(name, h as unknown as Set<Range>),
      delete: (name: string) => registered.delete(name),
    },
    createHighlight: () => new Set<Range>() as unknown as HighlightLike,
    document,
  };
  const ranges = () => [...(registered.get('bp-spelling-error') ?? [])];
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
};

/** In-memory SpellService: words listed in `bad` are misspelled. */
export function fakeService(bad: Record<string, string[]>, ready: Lang[] = ['en', 'ar']) {
  const listeners = new Set<(s: SpellServiceStatus) => void>();
  const readySet = new Set<Lang>(ready);
  const checked: Partial<Record<Lang, string[]>>[] = [];
  const known = new Map<string, boolean>();
  let hold: Promise<void> | undefined;
  const status = (): SpellServiceStatus => ({
    state: readySet.size ? 'ready' : 'loading',
    loaded: [...readySet].map((lang) => ({ lang, ms: 1 })),
    failed: [],
    pending: [],
  });
  const service: SpellService = {
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
  };
  return {
    service,
    checked,
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

export function composer(html = '') {
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
