import { languageOf } from '../tokenizer/tokenize';
import type { Lang, ResultByType, SpellCommand } from './protocol';

/** Anything that can send worker commands (SpellClient, or a fake in tests). */
export interface SpellRequester {
  request<C extends SpellCommand>(command: C): Promise<ResultByType[C['type']]>;
}

export interface SpellServiceStatus {
  /** loading: nothing usable yet; ready: at least one language loaded; failed: none loaded. */
  state: 'loading' | 'ready' | 'failed';
  loaded: { lang: Lang; ms: number }[];
  failed: { lang: Lang; reason: string }[];
  pending: Lang[];
}

/**
 * Page-side spelling service shared by every attached composer: loads
 * languages one at a time (English is usable before the ~7 MB Arabic
 * dictionary finishes), and caches results per language so a word is only
 * ever sent to the worker once.
 */
export interface SpellService {
  readonly status: SpellServiceStatus;
  onStatus(listener: (status: SpellServiceStatus) => void): () => void;
  isReady(lang: Lang): boolean;
  /** Cached result: true = misspelled, false = correct, undefined = unknown. */
  misspelled(lang: Lang, word: string): boolean | undefined;
  /** Checks every not-yet-cached word in one worker round trip. */
  check(words: Partial<Record<Lang, string[]>>): Promise<void>;
  suggest(lang: Lang, word: string): Promise<string[]>;
}

export interface SpellServiceOptions {
  languages?: Lang[];
  /** Admin custom dictionary: added to the engine of the matching script at load. */
  customWords?: string[];
}

export function createSpellService(requester: SpellRequester, options: SpellServiceOptions = {}): SpellService {
  const { languages = ['en', 'ar'], customWords = [] } = options;
  let status: SpellServiceStatus = { state: 'loading', loaded: [], failed: [], pending: [...languages] };
  const listeners = new Set<(s: SpellServiceStatus) => void>();
  const cache = new Map<Lang, Map<string, boolean>>();
  const inFlight = new Map<string, Promise<void>>();

  const publish = (next: SpellServiceStatus) => {
    status = next;
    listeners.forEach((l) => l(status));
  };

  void (async () => {
    for (const lang of languages) {
      let loaded = status.loaded;
      let failed = status.failed;
      try {
        const result = await requester.request({ type: 'load', langs: [lang] });
        if (result.loaded.length) {
          // Before publishing the language as ready, so no check can miss a custom word.
          const words = customWords.filter((w) => !/\s/.test(w) && languageOf(w) === lang);
          await Promise.all(words.map((word) => requester.request({ type: 'add', lang, word })));
        }
        loaded = [...loaded, ...result.loaded];
        failed = [...failed, ...result.failed];
      } catch (err) {
        failed = [...failed, { lang, reason: (err as Error).message }];
      }
      const pending = status.pending.filter((l) => l !== lang);
      const state = loaded.length ? 'ready' : pending.length ? 'loading' : 'failed';
      publish({ state, loaded, failed, pending });
    }
  })();

  const isReady = (lang: Lang) => status.loaded.some((l) => l.lang === lang);

  return {
    get status() {
      return status;
    },
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isReady,
    misspelled: (lang, word) => cache.get(lang)?.get(word),
    async check(words) {
      const toSend: Partial<Record<Lang, string[]>> = {};
      const waits: Promise<void>[] = [];
      for (const [lang, list] of Object.entries(words) as [Lang, string[]][]) {
        if (!isReady(lang)) continue;
        for (const word of new Set(list)) {
          if (cache.get(lang)?.has(word)) continue;
          const pending = inFlight.get(`${lang}:${word}`);
          if (pending) waits.push(pending);
          else (toSend[lang] ??= []).push(word);
        }
      }
      if (Object.keys(toSend).length) {
        const batch = requester.request({ type: 'check', words: toSend }).then((result) => {
          for (const [lang, list] of Object.entries(toSend) as [Lang, string[]][]) {
            if (result.unchecked[lang]) continue; // not loaded in the worker: leave unknown
            const bad = new Set(result.misspelled[lang] ?? []);
            const langCache = cache.get(lang) ?? new Map<string, boolean>();
            cache.set(lang, langCache);
            for (const word of list) langCache.set(word, bad.has(word));
          }
        });
        const settled = batch.finally(() => {
          for (const [lang, list] of Object.entries(toSend) as [Lang, string[]][]) {
            for (const word of list) inFlight.delete(`${lang}:${word}`);
          }
        });
        for (const [lang, list] of Object.entries(toSend) as [Lang, string[]][]) {
          for (const word of list) inFlight.set(`${lang}:${word}`, settled);
        }
        waits.push(settled);
      }
      await Promise.all(waits);
    },
    suggest: (lang, word) => requester.request({ type: 'suggest', lang, word }),
  };
}
