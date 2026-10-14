import { vi } from 'vitest';
import { createAssistant, type AssistantOptions } from '../../src/assistant';
import type { HighlightEnv, HighlightLike } from '../../src/assistant/highlights';
import type { Server } from '../../src/assistant/server';
import type { AssistEvent, AssistantEnv } from '../../src/assistant/state';

/** A fake CSS highlight registry; `words()` lists what the spelling underline paints. */
export function fakeHighlightEnv() {
  const registered = new Map<string, Set<Range>>();
  const env: HighlightEnv = {
    registry: {
      set: (name: string, h: HighlightLike) => registered.set(name, h as unknown as Set<Range>),
      delete: (name: string) => registered.delete(name),
    },
    createHighlight: () => new Set<Range>() as unknown as HighlightLike,
  };
  const ranges = (name = 'bp-spelling-error') => [...(registered.get(name) ?? [])];
  return { env, registered, ranges, words: () => ranges().map((r) => r.toString()) };
}

/** A server that never answers (tests that need answers pass their own). */
export const silentServer: Server = { check: async () => null, polish: async () => null };

/**
 * An assistant on `el` with test defaults: spelling in suggest mode, no
 * completion, no throttle wait, fake browser parts (highlights, rects, a no-op replace), events
 * collected in `events`. Override anything through `options`.
 */
export function testAssistant(el: HTMLElement, options: Partial<AssistantOptions> & { env?: Partial<AssistantEnv> } = {}) {
  const hl = fakeHighlightEnv();
  const events: AssistEvent[] = [];
  const replace = vi.fn<AssistantEnv['replace']>();
  const assistant = createAssistant(el, {
    spelling: 'suggest',
    customWords: [],
    completion: false,
    canned: [],
    kb: [],
    conversation: () => [],
    log: (e) => events.push(e),
    server: silentServer,
    spellingDebounceMs: 1,
    checkThrottleMs: 5,
    ...options,
    env: {
      highlights: hl.env,
      replace,
      rectOf: () => ({ left: 10, top: 10, right: 50, bottom: 26 }),
      caretRect: () => ({ left: 200, top: 60, right: 208, bottom: 78 }),
      contentBox: () => ({ left: 100, right: 500, top: 50, bottom: 110 }),
      isMac: false,
      ...options.env,
    },
  });
  return { assistant, hl, events, replace };
}

export function field(html = '') {
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
