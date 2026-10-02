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
    suggest: async (lang, word) => (word === 'recieve' ? ['receive', 'relieve'] : lang === 'ar' ? ['إذا'] : []),
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
