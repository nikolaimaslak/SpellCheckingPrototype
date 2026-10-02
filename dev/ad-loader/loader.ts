// DEV ONLY — never shipped. Attaches composer spell checking to a live Agent
// Desktop page for validation. In the tenant's DevTools console:
//   import('http://localhost:5174/ad-spell.js?v=' + Date.now())
// Undo everything with: __bpSpell.detachAll()
import { attachSpellCheck, type SpellCheckHandle } from '../../src/composer';
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
const service = createSpellService(new SpellClient(worker));
const handles = new Map<HTMLElement, SpellCheckHandle>();

function sync() {
  for (const el of document.querySelectorAll<HTMLElement>(COMPOSERS)) {
    if (!handles.has(el)) handles.set(el, attachSpellCheck(el, { service }));
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
console.info(`[bp-spell] loader active; attached to ${handles.size} composer(s)`);
