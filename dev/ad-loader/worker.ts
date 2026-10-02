// Classic-worker build of the spelling worker for the dev-only Agent Desktop
// loader. Bootstrapped from a blob URL on the tenant page, so every asset URL
// is absolute to the loader's dev server.
import { loadHunspell } from '../../src/spell/engine';
import { createHandler, type DictionaryLoader } from '../../src/spell/handler';
import type { SpellRequest } from '../../src/spell/protocol';

declare const __AD_ORIGIN__: string;
declare const self: DedicatedWorkerGlobalScope;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dictionary not found: ${url} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

const loadDictionary: DictionaryLoader = async (lang) => {
  const base = `${__AD_ORIGIN__}/dicts/${lang}/${lang}`;
  const [aff, dic] = await Promise.all([fetchBytes(`${base}.aff`), fetchBytes(`${base}.dic`)]);
  return { aff, dic };
};

const handle = createHandler(() => loadHunspell({ locateFile: () => `${__AD_ORIGIN__}/hunspell.wasm` }), loadDictionary);

self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  self.postMessage(await handle(event.data));
};
