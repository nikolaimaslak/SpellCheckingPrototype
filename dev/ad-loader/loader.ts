// DEV ONLY — never shipped. Attaches composer spell checking to a live Agent
// Desktop page for validation. In the tenant's DevTools console:
//   import('http://localhost:5174/ad-spell.js?v=' + Date.now())
// Undo everything with: __bpSpell.detachAll()
// Optional, before importing: window.__bpSpellConfig = { mode: 'auto', customDictionary: ['GOSI'], completion: true }
// completion: true / grammar: true send composer text to the server's hosted model: synthetic text only.
import { attachCompletion, createCompletionClient, type CompletionHandle } from '../../src/completion';
import { attachPolish, createPolishClient, type PolishHandle } from '../../src/polish';
import { attachSpellCheck, type SpellCheckHandle } from '../../src/composer';
import { parsePolicy, resolveMode } from '../../src/policy';
import { SpellClient } from '../../src/spell/client';
import { createSpellService } from '../../src/spell/service';

declare const __AD_ORIGIN__: string;

const COMPOSERS = 'div[contenteditable="true"]';

// Cross-origin classic workers can't be constructed directly; a same-origin
// blob that importScripts() the bundle can (the tenant allows blob workers).
const bootstrap = new Blob([`importScripts(${JSON.stringify(`${__AD_ORIGIN__}/ad-spell-worker.js`)});`], {
  type: 'text/javascript',
});
const worker = new Worker(URL.createObjectURL(bootstrap));
const config = ((window as { __bpSpellConfig?: Record<string, unknown> }).__bpSpellConfig ?? {}) as Record<string, unknown>;
const policy = parsePolicy(config);
const completionOn = config.completion === true;
if (completionOn) {
  console.warn('[bp-spell] inline completion ON: composer text is sent to the completion server and its hosted model. Use synthetic text only.');
}
const grammarOn = config.grammar === true;
if (grammarOn) {
  console.warn('[bp-spell] grammar polish ON: drafts are sent to the completion server and its hosted model. Use synthetic text only.');
}
const fetcher = createCompletionClient('http://localhost:5175');
const polishFetcher = createPolishClient('http://localhost:5175');
const completions = new Map<HTMLElement, CompletionHandle>();
const polishes = new Map<HTMLElement, PolishHandle>();
const mode = resolveMode(policy);
const service = createSpellService(new SpellClient(worker), { languages: policy.languages, customWords: policy.customDictionary });
const handles = new Map<HTMLElement, SpellCheckHandle>();

function sync() {
  for (const el of document.querySelectorAll<HTMLElement>(COMPOSERS)) {
    // Prefix-only context: Agent Desktop's transcript DOM uses build-specific class names.
    if (completionOn && !completions.has(el)) completions.set(el, attachCompletion(el, { fetcher, sources: { transcript: false, canned: true, kb: true } }));
  }
  for (const el of document.querySelectorAll<HTMLElement>(COMPOSERS)) {
    if (grammarOn && !polishes.has(el)) {
      polishes.set(el, attachPolish(el, { fetcher: polishFetcher, onOpen: () => completions.get(el)?.dismiss() }));
    }
  }
  for (const map of [completions, polishes] as Map<HTMLElement, { detach(): void }>[]) {
    for (const [el, handle] of map) {
      if (!el.isConnected) {
        handle.detach();
        map.delete(el);
      }
    }
  }
  if (mode === 'off') return;
  for (const el of document.querySelectorAll<HTMLElement>(COMPOSERS)) {
    if (!handles.has(el)) {
      handles.set(
        el,
        attachSpellCheck(el, {
          service,
          mode,
          languages: policy.languages,
          customWords: policy.customDictionary,
          onEvent: (e) => console.info('[bp-spell]', e.type, e.lang, e.original, e.replacement ?? ''),
        }),
      );
    }
  }
  for (const [el, handle] of handles) {
    if (!el.isConnected) {
      handle.detach();
      handles.delete(el);
    }
  }
}

// GWT creates a composer per interaction; follow them as they come and go.
const observer = new MutationObserver(sync);
observer.observe(document.body, { childList: true, subtree: true });
sync();

service.onStatus((s) => console.info('[bp-spell]', s.state, s.loaded, s.failed));

Object.assign(window, {
  __bpSpell: {
    service,
    handles,
    completions,
    polishes,
    detachAll() {
      observer.disconnect();
      handles.forEach((h) => h.detach());
      handles.clear();
      completions.forEach((h) => h.detach());
      completions.clear();
      polishes.forEach((h) => h.detach());
      polishes.clear();
      worker.terminate();
      console.info('[bp-spell] detached');
    },
  },
});
console.info(`[bp-spell] loader active (mode: ${mode}, completion: ${completionOn ? 'on' : 'off'}, grammar: ${grammarOn ? 'on' : 'off'}); attached to ${handles.size} composer(s)`);
