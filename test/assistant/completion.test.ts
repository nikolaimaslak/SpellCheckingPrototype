// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/assistant';
import type { CompletionReply, Server } from '../../src/assistant/server';
import type { AssistEvent, CompletionEvent } from '../../src/assistant/state';
import { fakeChecker, testAssistant } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => {
  assistants.splice(0).forEach((a) => a.detach());
  document.body.replaceChildren();
});

type Complete = Server['complete'];

function setup(
  reply: string | null = ' will be processed within 3 working days.',
  completeImpl?: Complete,
  opts: { text?: string; isMac?: boolean; dir?: 'ltr'; spelling?: 'off' | 'suggest'; bad?: Record<string, string[]>; polished?: string } = {},
) {
  document.body.innerHTML = `<div id="c" contenteditable="true"${opts.dir ? ` dir="${opts.dir}"` : ''}></div>`;
  const el = document.getElementById('c')!;
  el.textContent = opts.text ?? 'Thank you, your request';
  el.focus();
  document.getSelection()!.collapse(el.firstChild!, el.textContent.length);
  const complete = vi.fn<Complete>(
    completeImpl ?? (async () => (reply === null ? null : ({ completion: reply, lang: 'en', latencyMs: 1, model: 'fake', sources: [] } satisfies CompletionReply))),
  );
  const replace = vi.fn((range: Range, text: string) => {
    const node = range.startContainer as Text;
    node.insertData(range.startOffset, text);
    document.getSelection()!.collapse(node, range.startOffset + text.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
  });
  const polish = vi.fn<Server['polish']>(async (text) => ({ polished: opts.polished ?? text, changed: opts.polished !== undefined, lang: 'en', latencyMs: 1, model: 'fake' }));
  const { assistant, events: all } = testAssistant(el, {
    spelling: opts.spelling ?? 'off',
    checker: fakeChecker(opts.bad ?? {}).checker,
    completion: true,
    canned: ['Your request will be processed.'],
    kb: [],
    server: { complete, polish },
    conversation: () => [{ role: 'customer', text: 'when will it be processed?' }],
    env: { replace, isMac: opts.isMac ?? false },
  });
  assistants.push(assistant);
  const completion = assistant.completion!;
  // Only the completion events (the server events carry request and reply text by design).
  const events = all as AssistEvent[];
  const completionEvents = () => events.filter((e): e is CompletionEvent => e.type.startsWith('completion-'));
  const ghostText = () => assistant.getState().ghost?.text ?? '';
  return { el, complete, polish, events, completionEvents, replace, assistant, completion, ghostText };
}

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

describe('inline completion', () => {
  it('requests once after the pause and shows ghost text without touching the field', async () => {
    const { el, complete, completionEvents, events, completion, ghostText, assistant } = setup();
    await completion.requestNow();
    expect(complete).toHaveBeenCalledTimes(1);
    const [body] = complete.mock.calls[0];
    expect(body.prefix).toBe('Thank you, your request');
    expect(body.transcript).toEqual([{ role: 'customer', text: 'when will it be processed?' }]);
    expect(body.sources).toEqual({ transcript: true, canned: true, kb: false });
    expect(body.canned).toEqual(['Your request will be processed.']);
    expect(body.kb).toEqual([]);
    expect(ghostText()).toBe(' will be processed within 3 working days.');
    expect(assistant.getState().ghost?.layout).toMatchObject({ top: 60, left: 100, width: 400, textIndent: 108 });
    expect(el.innerHTML).toBe('Thank you, your request');
    expect(completionEvents()).toEqual([{ type: 'completion-shown', lang: 'en', latencyMs: expect.any(Number), shownLength: 41 }]);
    expect(events.map((e) => e.type)).toEqual(['complete-request', 'complete-reply', 'completion-shown']);
    expect(events[0]).toEqual({ type: 'complete-request', prefix: 'Thank you, your request', turns: 1, canned: 1, kb: 0 });
  });

  it('fires after the debounce on input', async () => {
    const { el, complete } = setup();
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 't' }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  });

  it('aborts on a keystroke and ignores the late reply', async () => {
    let resolve!: (v: CompletionReply) => void;
    let signal!: AbortSignal;
    const slow: Complete = (_b, s) => ((signal = s), new Promise<CompletionReply>((r) => (resolve = r)));
    const { el, completion, ghostText } = setup(null, slow);
    const pending = completion.requestNow();
    typeChar(el, 's');
    expect(signal.aborted).toBe(true);
    resolve({ completion: ' late', lang: 'en', latencyMs: 1, model: 'x', sources: [] });
    await pending;
    expect(ghostText()).toBe('');
  });

  it('Tab accepts once through replace, and the page never sees the Tab', async () => {
    const { el, replace, completionEvents, completion, ghostText } = setup();
    await completion.requestNow();
    const pageKeydown = vi.fn();
    el.addEventListener('keydown', pageKeydown);
    const e = key('Tab', el);
    expect(e.defaultPrevented).toBe(true);
    expect(pageKeydown).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('Thank you, your request will be processed within 3 working days.');
    expect(ghostText()).toBe('');
    expect(completionEvents().at(-1)).toMatchObject({ type: 'completion-accepted', acceptedLength: 41 });
  });

  it('does not intercept Tab when no ghost text is showing', () => {
    const { el } = setup();
    expect(key('Tab', el).defaultPrevented).toBe(false);
  });

  it('typing matching characters consumes the ghost; diverging dismisses it', async () => {
    const { el, completionEvents, completion, ghostText } = setup();
    await completion.requestNow();
    typeChar(el, ' ');
    typeChar(el, 'w');
    typeChar(el, 'i');
    expect(ghostText()).toBe('ll be processed within 3 working days.');
    typeChar(el, 'x');
    expect(ghostText()).toBe('');
    expect(completionEvents().at(-1)).toMatchObject({ type: 'completion-dismissed' });
  });

  it('Escape dismisses without reaching the page; Enter dismisses without being prevented', async () => {
    const { el, completion, ghostText } = setup();
    await completion.requestNow();
    const pageKeydown = vi.fn();
    el.addEventListener('keydown', pageKeydown);
    key('Escape', el);
    expect(pageKeydown).not.toHaveBeenCalled();
    expect(ghostText()).toBe('');
    await completion.requestNow();
    expect(ghostText()).not.toBe('');
    const enter = key('Enter', el);
    expect(enter.defaultPrevented).toBe(false);
    expect(pageKeydown).toHaveBeenCalledTimes(1);
    expect(ghostText()).toBe('');
  });

  it('typing-through works from input events alone (execCommand and some IMEs fire no beforeinput)', async () => {
    const { el, completion, ghostText } = setup();
    await completion.requestNow();
    for (const ch of ' wi') {
      const node = el.firstChild as Text;
      node.appendData(ch);
      document.getSelection()!.collapse(node, node.length);
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch }));
    }
    expect(ghostText()).toBe('ll be processed within 3 working days.');
  });

  it('does not request while the spelling popover is open', async () => {
    const { el, complete, completion, assistant } = setup(undefined, undefined, {
      text: 'I will recieve your request',
      spelling: 'suggest',
      bad: { en: ['recieve'] },
    });
    await assistant.spelling!.recheck();
    document.getSelection()!.collapse(el.firstChild!, 9); // inside "recieve"
    key('.', el, { ctrlKey: true });
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    document.getSelection()!.collapse(el.firstChild!, el.textContent!.length);
    await completion.requestNow();
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not request while the polish preview is open', async () => {
    const { complete, completion, assistant } = setup();
    await assistant.polishNow();
    expect(assistant.getState().polish.preview).toBeDefined();
    await completion.requestNow();
    expect(complete).not.toHaveBeenCalled();
  });

  it('pressing Polish hides the ghost text', async () => {
    const { completion, assistant, ghostText } = setup();
    await completion.requestNow();
    expect(ghostText()).not.toBe('');
    await assistant.polishNow();
    expect(ghostText()).toBe('');
  });

  it('dismisses when the page clears the field (send)', async () => {
    const { el, completion, ghostText } = setup();
    await completion.requestNow();
    el.replaceChildren();
    await vi.waitFor(() => expect(ghostText()).toBe(''));
  });

  it('completion events never contain text', async () => {
    const { el, completionEvents, completion } = setup();
    await completion.requestNow();
    key('Tab', el);
    const json = JSON.stringify(completionEvents());
    expect(json).not.toContain('processed');
    expect(json).not.toContain('request');
  });

  it('shows nothing when the server has nothing (or is down)', async () => {
    const { complete, completion, ghostText } = setup(null);
    await completion.requestNow();
    expect(complete).toHaveBeenCalled();
    expect(ghostText()).toBe('');
  });

  it('dismiss() hides the ghost text and detach() clears it', async () => {
    const { completion, assistant, ghostText } = setup();
    await completion.requestNow();
    completion.dismiss();
    expect(ghostText()).toBe('');
    await completion.requestNow();
    completion.detach();
    expect(assistant.getState().ghost).toBeUndefined();
  });

  describe('forward arrow and word accept (Req 3.2)', () => {
    const AR_PREFIX = 'شكراً لتواصلك معنا، تم استلام طلبك';
    const AR_REPLY = ' وسيتم الرد عليك قريباً';
    const pause = () => new Promise((r) => setTimeout(r, 30));

    it('Right Arrow accepts an English suggestion, unseen by the page', async () => {
      const { el, replace, completion, ghostText } = setup();
      await completion.requestNow();
      const pageSaw = vi.fn();
      el.addEventListener('keydown', pageSaw);
      const e = key('ArrowRight', el);
      expect(e.defaultPrevented).toBe(true);
      expect(pageSaw).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' will be processed within 3 working days.');
      expect(ghostText()).toBe('');
    });

    it.each([[undefined], ['ltr' as const]])('Left Arrow accepts an Arabic suggestion (field dir %s)', async (dir) => {
      const { el, replace, completion, ghostText } = setup(AR_REPLY, undefined, { text: AR_PREFIX, dir });
      await completion.requestNow();
      expect(ghostText()).toBe(AR_REPLY);
      expect(key('ArrowLeft', el).defaultPrevented).toBe(true);
      expect(replace).toHaveBeenCalledWith(expect.anything(), AR_REPLY);
      expect(el.textContent).toBe(AR_PREFIX + AR_REPLY);
    });

    it('the backward arrow and Shift+Right dismiss without being prevented', async () => {
      const { el, replace, completion, ghostText } = setup();
      await completion.requestNow();
      expect(key('ArrowLeft', el).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      await completion.requestNow();
      expect(key('ArrowRight', el, { shiftKey: true }).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      expect(replace).not.toHaveBeenCalled();
    });

    it('the Right Arrow dismisses an Arabic suggestion', async () => {
      const ar = setup(AR_REPLY, undefined, { text: AR_PREFIX });
      await ar.completion.requestNow();
      expect(key('ArrowRight', ar.el).defaultPrevented).toBe(false);
      expect(ar.ghostText()).toBe('');
      expect(ar.replace).not.toHaveBeenCalled();
    });

    it('arrows are not intercepted without ghost text', () => {
      const { el } = setup();
      expect(key('ArrowRight', el).defaultPrevented).toBe(false);
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(false);
    });

    it('Ctrl+Right accepts word by word, each through its own replace', async () => {
      const { el, replace, complete, completion, ghostText } = setup();
      await completion.requestNow();
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(true);
      key('ArrowRight', el, { ctrlKey: true });
      expect(replace.mock.calls.map((c) => c[1])).toEqual([' will', ' be']);
      expect(el.textContent).toBe('Thank you, your request will be');
      expect(ghostText()).toBe(' processed within 3 working days.');
      await pause();
      expect(complete).toHaveBeenCalledTimes(1); // no new request while words remain
    });

    it('Ctrl+Left accepts an Arabic word', async () => {
      const { el, replace, completion, ghostText } = setup(AR_REPLY, undefined, { text: AR_PREFIX });
      await completion.requestNow();
      key('ArrowLeft', el, { ctrlKey: true });
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' وسيتم');
      expect(ghostText()).toBe(' الرد عليك قريباً');
    });

    it('on macOS, Option+Right accepts a word and Ctrl+Right dismisses', async () => {
      const { el, replace, completion, ghostText } = setup(undefined, undefined, { isMac: true });
      await completion.requestNow();
      key('ArrowRight', el, { altKey: true });
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' will');
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
    });

    it('mixes word accept, typing through and Tab', async () => {
      const { el, replace, completion, ghostText } = setup();
      await completion.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      for (const ch of ' be') typeChar(el, ch);
      expect(ghostText()).toBe(' processed within 3 working days.');
      key('Tab', el);
      expect(replace.mock.calls.at(-1)![1]).toBe(' processed within 3 working days.');
      expect(el.textContent).toBe('Thank you, your request will be processed within 3 working days.');
    });

    it('after the last word, the next pause requests a new completion', async () => {
      const { el, complete, completion, ghostText } = setup(' is received'); // no full stop: the sentence can continue
      await completion.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      key('ArrowRight', el, { ctrlKey: true });
      expect(ghostText()).toBe('');
      await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
    });
  });

  describe('events for partial accepts', () => {
    it('a partly accepted suggestion ends as accepted with the accepted length', async () => {
      const { el, completionEvents, completion } = setup(' will be processed within 3 working days');
      await completion.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      typeChar(el, 'X');
      const events = completionEvents();
      expect(events.map((e) => e.type)).toEqual(['completion-shown', 'completion-accepted']);
      expect(events[1]).toMatchObject({ shownLength: 40, acceptedLength: 5 });
    });

    it('the forward arrow reports the full length', async () => {
      const { el, completionEvents, completion } = setup();
      await completion.requestNow();
      key('ArrowRight', el);
      expect(completionEvents()[1]).toMatchObject({ type: 'completion-accepted', shownLength: 41, acceptedLength: 41 });
    });

    it('typing through then Tab reports the full length', async () => {
      const { el, completionEvents, completion } = setup();
      await completion.requestNow();
      for (const ch of ' wi') typeChar(el, ch);
      key('Tab', el);
      expect(completionEvents().at(-1)).toMatchObject({ type: 'completion-accepted', shownLength: 41, acceptedLength: 41 });
    });

    it('word-accept events contain no text', async () => {
      const { el, completionEvents, completion } = setup();
      await completion.requestNow();
      key('ArrowRight', el, { ctrlKey: true });
      key('Escape', el);
      const json = JSON.stringify(completionEvents());
      expect(json).not.toContain('will');
      expect(json).not.toContain('request');
    });
  });
});
