/// <reference lib="webworker" />
import { loadHunspell } from './engine';
import { createHandler, type DictionaryLoader } from './handler';
import type { SpellRequest } from './protocol';
import wasmUrl from './wasm/hunspell.wasm?url';

declare const self: DedicatedWorkerGlobalScope;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  // Guard against an SPA fallback answering a missing file with index.html.
  if (!res.ok || res.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error(`dictionary not found: ${url} (HTTP ${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Same-origin static files only: nothing else touches the network.
const loadDictionary: DictionaryLoader = async (lang) => {
  const base = `${import.meta.env.BASE_URL}dicts/${lang}/${lang}`;
  const [aff, dic] = await Promise.all([fetchBytes(`${base}.aff`), fetchBytes(`${base}.dic`)]);
  return { aff, dic };
};

const handle = createHandler(() => loadHunspell({ locateFile: () => wasmUrl }), loadDictionary);

self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  self.postMessage(await handle(event.data));
};
