import type { HunspellRuntime, SpellEngine } from './engine';
import type { Lang, LoadResult, SpellReply, SpellRequest } from './protocol';

export interface DictionaryFiles {
  aff: Uint8Array;
  dic: Uint8Array;
}

/** Fetches a language's .aff/.dic pair; rejects when it is unavailable. */
export type DictionaryLoader = (lang: Lang) => Promise<DictionaryFiles>;

/**
 * Builds the worker's request handler. Kept free of worker globals so tests can
 * drive it in Node with a filesystem-backed loader.
 */
export function createHandler(
  getRuntime: () => Promise<HunspellRuntime>,
  loadDictionary: DictionaryLoader,
  now: () => number = () => performance.now(),
): (request: SpellRequest) => Promise<SpellReply> {
  const engines = new Map<Lang, SpellEngine>();
  let runtime: Promise<HunspellRuntime> | undefined;

  async function load(langs: Lang[]): Promise<LoadResult> {
    runtime ??= getRuntime();
    const rt = await runtime;
    const result: LoadResult = { loaded: [], failed: [] };
    // Sequential, in the order given: the first language becomes usable
    // without waiting for a slower one (the Arabic .dic is ~7 MB).
    for (const lang of langs) {
      const start = now();
      try {
        const { aff, dic } = await loadDictionary(lang);
        engines.get(lang)?.destroy();
        engines.set(lang, rt.createEngine(aff, dic));
        result.loaded.push({ lang, ms: Math.round(now() - start) });
      } catch (err) {
        result.failed.push({ lang, reason: (err as Error).message });
      }
    }
    return result;
  }

  function engineFor(lang: Lang): SpellEngine {
    const engine = engines.get(lang);
    if (!engine) throw new Error(`language not loaded: ${lang}`);
    return engine;
  }

  return async (request) => {
    try {
      switch (request.type) {
        case 'load':
          return { id: request.id, ok: true, result: await load(request.langs) };
        case 'spell':
          return { id: request.id, ok: true, result: engineFor(request.lang).spell(request.word) };
        case 'suggest':
          return { id: request.id, ok: true, result: engineFor(request.lang).suggest(request.word) };
        case 'add':
          engineFor(request.lang).add(request.word);
          return { id: request.id, ok: true, result: null };
      }
    } catch (err) {
      return { id: request.id, ok: false, error: (err as Error).message };
    }
  };
}
