import { languageOf } from '../tokenizer/tokenize';
import type { Lang, ResultByType, SpellCommand, SpellReply } from './protocol';

/** Sends commands to the spelling worker (or, in tests and the eval, straight to the handler). */
export interface SpellRequester {
  request<C extends SpellCommand>(command: C): Promise<ResultByType[C['type']]>;
  terminate?(): void;
}

/** The subset of Worker the requester needs; lets tests pass a fake. */
export interface SpellPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SpellReply>) => void): void;
  terminate?(): void;
}

export interface SpellStatus {
  /** loading: nothing usable yet; ready: at least one language loaded; failed: none loaded. */
  state: 'loading' | 'ready' | 'failed';
  loaded: { lang: Lang; ms: number }[];
  failed: { lang: Lang; reason: string }[];
  pending: Lang[];
}

/**
 * The page side of spelling: loads languages one at a time (English is usable
 * before the ~7 MB Arabic dictionary finishes) and caches results per
 * language, so a word is only ever sent to the worker once.
 */
export interface SpellChecker {
  readonly status: SpellStatus;
  onStatus(listener: (status: SpellStatus) => void): () => void;
  isReady(lang: Lang): boolean;
  /** Cached result: true = misspelled, false = correct, undefined = unknown. */
  misspelled(lang: Lang, word: string): boolean | undefined;
  /** Checks every not-yet-cached word in one worker round trip. */
  check(words: Partial<Record<Lang, string[]>>): Promise<void>;
  suggest(lang: Lang, word: string): Promise<string[]>;
  /** Every dictionary word one edit away; deterministic, so cached per word. */
  neighbors(lang: Lang, word: string): Promise<string[]>;
  /** Stops the worker; pending and later requests reject. */
  terminate(): void;
}

export interface SpellCheckerOptions {
  languages?: Lang[];
  /** Custom dictionary: added to the engine of the matching script at load. */
  customWords?: string[];
}

/** Starts the spelling worker and a checker over it. */
export function startSpellChecker(options: SpellCheckerOptions = {}): SpellChecker {
  const worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
  return createSpellChecker(workerRequester(worker), options);
}

/** Request/reply over a worker port, matched by id. */
export function workerRequester(port: SpellPort): SpellRequester {
  let nextId = 1;
  let terminated = false;
  const pending = new Map<number, { resolve: (value: never) => void; reject: (err: Error) => void }>();
  port.addEventListener('message', ({ data }) => {
    const entry = pending.get(data.id);
    if (!entry) return; // stale or unknown reply
    pending.delete(data.id);
    if (data.ok) entry.resolve(data.result as never);
    else entry.reject(new Error(data.error));
  });
  return {
    request(command) {
      if (terminated) return Promise.reject(new Error('spell worker terminated'));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        port.postMessage({ ...command, id });
      });
    },
    terminate() {
      if (terminated) return;
      terminated = true;
      port.terminate?.();
      const err = new Error('spell worker terminated');
      pending.forEach((p) => p.reject(err));
      pending.clear();
    },
  };
}

export function createSpellChecker(requester: SpellRequester, options: SpellCheckerOptions = {}): SpellChecker {
  const { languages = ['en', 'ar'], customWords = [] } = options;
  let status: SpellStatus = { state: 'loading', loaded: [], failed: [], pending: [...languages] };
  const listeners = new Set<(s: SpellStatus) => void>();
  const cache = new Map<Lang, Map<string, boolean>>();
  const inFlight = new Map<string, Promise<void>>();
  const neighborCache = new Map<string, Promise<string[]>>();

  const publish = (next: SpellStatus) => {
    status = next;
    listeners.forEach((l) => l(status));
  };

  void (async () => {
    for (const lang of languages) {
      let { loaded, failed } = status;
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
          const sharing = inFlight.get(`${lang}:${word}`);
          if (sharing) waits.push(sharing);
          else (toSend[lang] ??= []).push(word);
        }
      }
      const sent = Object.entries(toSend) as [Lang, string[]][];
      if (sent.length) {
        const batch = requester.request({ type: 'check', words: toSend }).then((result) => {
          for (const [lang, list] of sent) {
            if (result.unchecked[lang]) continue; // not loaded in the worker: leave unknown
            const bad = new Set(result.misspelled[lang] ?? []);
            const langCache = cache.get(lang) ?? new Map<string, boolean>();
            cache.set(lang, langCache);
            for (const word of list) langCache.set(word, bad.has(word));
          }
        });
        const settled = batch.finally(() => sent.forEach(([lang, list]) => list.forEach((w) => inFlight.delete(`${lang}:${w}`))));
        sent.forEach(([lang, list]) => list.forEach((w) => inFlight.set(`${lang}:${w}`, settled)));
        waits.push(settled);
      }
      await Promise.all(waits);
    },
    suggest: (lang, word) => requester.request({ type: 'suggest', lang, word }),
    neighbors(lang, word) {
      const key = `${lang}:${word}`;
      let entry = neighborCache.get(key);
      if (!entry) {
        entry = requester.request({ type: 'neighbors', lang, word });
        neighborCache.set(key, entry);
        entry.catch(() => neighborCache.delete(key)); // a failure is not cached
      }
      return entry;
    },
    terminate: () => requester.terminate?.(),
  };
}
