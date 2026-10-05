// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompletionFetcher } from '../../src/completion/client';
import { attachCompletion, type CompletionEvent } from '../../src/completion/controller';
import type { GhostMeasure } from '../../src/completion/ghost';

const measure: GhostMeasure = { caretRect: () => new DOMRect(200, 60, 8, 18), contentBox: () => ({ left: 100, right: 500, top: 50, bottom: 110 }) };
const handles: { detach(): void }[] = [];
afterEach(() => {
  handles.splice(0).forEach((h) => h.detach());
  document.body.replaceChildren();
});

function setup(
  reply: string | null = ' will be processed within 3 working days.',
  fetchImpl?: CompletionFetcher,
  opts: { text?: string; isMac?: boolean; dir?: 'ltr' } = {},
) {
  document.body.innerHTML = `<div id="c" contenteditable="true"${opts.dir ? ` dir="${opts.dir}"` : ''}></div>`;
  const el = document.getElementById('c')!;
  el.textContent = opts.text ?? 'Thank you, your request';
  el.focus();
  document.getSelection()!.collapse(el.firstChild!, el.textContent.length);
  const fetcher = vi.fn(fetchImpl ?? (async () => (reply === null ? null : { completion: reply, lang: 'en' as const, latencyMs: 1, model: 'fake', sources: [] })));
  const events: CompletionEvent[] = [];
  const replace = vi.fn((range: Range, text: string) => {
    const node = range.startContainer as Text;
    node.insertData(range.startOffset, text);
    document.getSelection()!.collapse(node, range.startOffset + text.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
  });
  const handle = attachCompletion(el, {
    fetcher,
    debounceMs: 5,
    transcript: () => [{ role: 'customer', text: 'when will it be processed?' }],
    onEvent: (e) => events.push(e),
    env: { replace, measure, isMac: opts.isMac ?? false },
  });
  handles.push(handle);
  return { el, fetcher, events, replace, handle };
}

const ghost = () => document.querySelector<HTMLElement>('[data-bp-ghost]');
const ghostText = () => (ghost()?.style.display === 'block' ? ghost()!.textContent : '');
const key = (k: string, target: EventTarget, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
/** What a browser does when the agent types one character at the caret. */
function typeChar(el: HTMLElement, ch: string) {
  el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ch, cancelable: true }));
  const node = el.firstChild as Text;
  node.appendData(ch);
  document.getSelection()!.collapse(node, node.length);
  el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch }));
}

describe('inline completion controller', () => {
  it('requests once after the pause and shows ghost text without touching the composer', async () => {
    const { el, fetcher, events, handle } = setup();
    await handle.requestNow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [body] = fetcher.mock.calls[0];
    expect(body.prefix).toBe('Thank you, your request');
    expect(body.transcript).toEqual([{ role: 'customer', text: 'when will it be processed?' }]);
    expect(body.sources).toEqual({ transcript: true, canned: true, kb: true });
    expect(ghostText()).toBe(' will be processed within 3 working days.');
    expect(el.innerHTML).toBe('Thank you, your request');
    expect(events).toEqual([{ type: 'completion-shown', lang: 'en', latencyMs: expect.any(Number), shownLength: 41 }]);
  });

  it('fires after the debounce on input', async () => {
    const { el, fetcher } = setup();
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 't' }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });

  it('aborts on a keystroke and ignores the late reply', async () => {
    let resolve!: (v: unknown) => void;
    let signal!: AbortSignal;
    const slow: CompletionFetcher = (_b, s) => ((signal = s), new Promise((r) => (resolve = r)) as never);
    const { el, handle } = setup(null, slow);
    const pending = handle.requestNow();
    typeChar(el, 's');
    expect(signal.aborted).toBe(true);
    resolve({ completion: ' late', lang: 'en', latencyMs: 1, model: 'x', sources: [] });
    await pending;
    expect(ghostText()).toBe('');
  });

  it('Tab accepts once through replace, and the host never sees the Tab', async () => {
    const { el, replace, events, handle } = setup();
    await handle.requestNow();
    const hostKeydown = vi.fn();
    el.addEventListener('keydown', hostKeydown);
    const e = key('Tab', el);
    expect(e.defaultPrevented).toBe(true);
    expect(hostKeydown).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('Thank you, your request will be processed within 3 working days.');
    expect(ghostText()).toBe('');
    expect(events.at(-1)).toMatchObject({ type: 'completion-accepted', acceptedLength: 41 });
  });

  it('does not intercept Tab when no ghost text is showing', () => {
    const { el } = setup();
    expect(key('Tab', el).defaultPrevented).toBe(false);
  });

  it('typing matching characters consumes the ghost; diverging dismisses it', async () => {
    const { el, events, handle } = setup();
    await handle.requestNow();
    typeChar(el, ' ');
    typeChar(el, 'w');
    typeChar(el, 'i');
    expect(ghostText()).toBe('ll be processed within 3 working days.');
    typeChar(el, 'x');
    expect(ghostText()).toBe('');
    expect(events.at(-1)).toMatchObject({ type: 'completion-dismissed' });
  });

  it('Escape dismisses without reaching the host; Enter dismisses without being prevented', async () => {
    const { el, handle } = setup();
    await handle.requestNow();
    const hostKeydown = vi.fn();
    el.addEventListener('keydown', hostKeydown);
    key('Escape', el);
    expect(hostKeydown).not.toHaveBeenCalled();
    expect(ghostText()).toBe('');
    await handle.requestNow();
    expect(ghostText()).not.toBe('');
    const enter = key('Enter', el);
    expect(enter.defaultPrevented).toBe(false);
    expect(hostKeydown).toHaveBeenCalledTimes(1);
    expect(ghostText()).toBe('');
  });

  it('typing-through works from input events alone (execCommand and some IMEs fire no beforeinput)', async () => {
    const { el, handle } = setup();
    await handle.requestNow();
    for (const ch of ' wi') {
      const node = el.firstChild as Text;
      node.appendData(ch);
      document.getSelection()!.collapse(node, node.length);
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch }));
    }
    expect(ghostText()).toBe('ll be processed within 3 working days.');
  });

  it('does not request while the spelling popover is open', async () => {
    const { fetcher, handle } = setup();
    const pop = document.createElement('div');
    pop.dataset.bpSpellPopover = '';
    document.body.append(pop);
    await handle.requestNow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('dismisses when the host clears the composer (send)', async () => {
    const { el, handle } = setup();
    await handle.requestNow();
    el.replaceChildren();
    await vi.waitFor(() => expect(ghostText()).toBe(''));
  });

  it('events never contain text', async () => {
    const { el, events, handle } = setup();
    await handle.requestNow();
    key('Tab', el);
    const json = JSON.stringify(events);
    expect(json).not.toContain('processed');
    expect(json).not.toContain('request');
  });

  it('shows nothing when the service has nothing (or is down)', async () => {
    const { fetcher, handle } = setup(null);
    await handle.requestNow();
    expect(fetcher).toHaveBeenCalled();
    expect(ghostText()).toBe('');
  });

  describe('forward arrow and word accept (Req 3.2)', () => {
    const AR_PREFIX = 'شكراً لتواصلك معنا، تم استلام طلبك';
    const AR_REPLY = ' وسيتم الرد عليك قريباً';
    const pause = () => new Promise((r) => setTimeout(r, 30));

    it('Right Arrow accepts an English suggestion, unseen by the host', async () => {
      const { el, replace, handle } = setup();
      await handle.requestNow();
      const hostSaw = vi.fn();
      el.addEventListener('keydown', hostSaw);
      const e = key('ArrowRight', el);
      expect(e.defaultPrevented).toBe(true);
      expect(hostSaw).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' will be processed within 3 working days.');
      expect(ghostText()).toBe('');
    });

    it.each([[undefined], ['ltr' as const]])('Left Arrow accepts an Arabic suggestion (composer dir %s)', async (dir) => {
      const { el, replace, handle } = setup(AR_REPLY, undefined, { text: AR_PREFIX, dir });
      await handle.requestNow();
      expect(ghostText()).toBe(AR_REPLY);
      expect(key('ArrowLeft', el).defaultPrevented).toBe(true);
      expect(replace).toHaveBeenCalledWith(expect.anything(), AR_REPLY);
      expect(el.textContent).toBe(AR_PREFIX + AR_REPLY);
    });

    it('the backward arrow and Shift+Right dismiss without being prevented', async () => {
      const { el, replace, handle } = setup();
      await handle.requestNow();
      expect(key('ArrowLeft', el).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      await handle.requestNow();
      expect(key('ArrowRight', el, { shiftKey: true }).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      const ar = setup(AR_REPLY, undefined, { text: AR_PREFIX });
      await ar.handle.requestNow();
      expect(key('ArrowRight', ar.el).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      expect(replace).not.toHaveBeenCalled();
      expect(ar.replace).not.toHaveBeenCalled();
    });

    it('arrows are not intercepted without ghost text', () => {
      const { el } = setup();
      expect(key('ArrowRight', el).defaultPrevented).toBe(false);
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(false);
    });

    it('Ctrl+Right accepts word by word, each through its own replace', async () => {
      const { el, replace, fetcher, handle } = setup();
      await handle.requestNow();
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(true);
      key('ArrowRight', el, { ctrlKey: true });
      expect(replace.mock.calls.map((c) => c[1])).toEqual([' will', ' be']);
      expect(el.textContent).toBe('Thank you, your request will be');
      expect(ghostText()).toBe(' processed within 3 working days.');
      await pause();
      expect(fetcher).toHaveBeenCalledTimes(1); // no new request while words remain
    });

    it('Ctrl+Left accepts an Arabic word', async () => {
      const { el, replace, handle } = setup(AR_REPLY, undefined, { text: AR_PREFIX });
      await handle.requestNow();
      key('ArrowLeft', el, { ctrlKey: true });
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' وسيتم');
      expect(ghostText()).toBe(' الرد عليك قريباً');
    });

    it('on macOS, Option+Right accepts a word and Ctrl+Right dismisses', async () => {
      const { el, replace, handle } = setup(undefined, undefined, { isMac: true });
      await handle.requestNow();
      key('ArrowRight', el, { altKey: true });
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' will');
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
    });

    it('mixes word accept, typing through and Tab', async () => {
      const { el, replace, handle } = setup();
      await handle.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      for (const ch of ' be') typeChar(el, ch);
      expect(ghostText()).toBe(' processed within 3 working days.');
      key('Tab', el);
      expect(replace.mock.calls.at(-1)![1]).toBe(' processed within 3 working days.');
      expect(el.textContent).toBe('Thank you, your request will be processed within 3 working days.');
    });

    it('after the last word, the next pause requests a new completion', async () => {
      const { el, fetcher, handle } = setup(' is received'); // no full stop: the sentence can continue
      await handle.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      key('ArrowRight', el, { ctrlKey: true });
      expect(ghostText()).toBe('');
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    });
  });

  describe('events for partial accepts', () => {
    it('a partly accepted suggestion ends as accepted with the accepted length', async () => {
      const { el, events, handle } = setup(' will be processed within 3 working days');
      await handle.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      typeChar(el, 'X');
      expect(events.map((e) => e.type)).toEqual(['completion-shown', 'completion-accepted']);
      expect(events[1]).toMatchObject({ shownLength: 40, acceptedLength: 5 });
    });

    it('the forward arrow reports the full length', async () => {
      const { el, events, handle } = setup();
      await handle.requestNow();
      key('ArrowRight', el);
      expect(events[1]).toMatchObject({ type: 'completion-accepted', shownLength: 41, acceptedLength: 41 });
    });

    it('typing through then Tab reports the full length', async () => {
      const { el, events, handle } = setup();
      await handle.requestNow();
      for (const ch of ' wi') typeChar(el, ch);
      key('Tab', el);
      expect(events.at(-1)).toMatchObject({ type: 'completion-accepted', shownLength: 41, acceptedLength: 41 });
    });

    it('word-accept events contain no text', async () => {
      const { el, events, handle } = setup();
      await handle.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      key('Escape', el);
      const json = JSON.stringify(events);
      expect(json).not.toContain('will');
      expect(json).not.toContain('request');
    });
  });
});
