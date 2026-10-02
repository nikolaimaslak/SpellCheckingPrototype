// DEV ONLY — never shipped. Attaches composer spell checking to a live Agent
// Desktop page for validation. In the tenant's DevTools console:
//   import('http://localhost:5174/ad-spell.js?v=' + Date.now())
// Undo everything with: __bpSpell.detachAll()
// Optional, before importing: window.__bpSpellConfig = { mode: 'auto', customDictionary: ['GOSI'] }
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
const policy = parsePolicy((window as { __bpSpellConfig?: unknown }).__bpSpellConfig);
const mode = resolveMode(policy);
const service = createSpellService(new SpellClient(worker), { languages: policy.languages, customWords: policy.customDictionary });
const handles = new Map<HTMLElement, SpellCheckHandle>();

function sync() {
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
    detachAll() {
      observer.disconnect();
      handles.forEach((h) => h.detach());
      handles.clear();
      worker.terminate();
      console.info('[bp-spell] detached');
    },
  },
});
console.info(`[bp-spell] loader active (mode: ${mode}); attached to ${handles.size} composer(s)`);
