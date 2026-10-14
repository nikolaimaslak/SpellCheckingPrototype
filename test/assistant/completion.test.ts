// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/assistant';
import type { CheckReply, Mistake, Server } from '../../src/assistant/server';
import type { AssistEvent, CompletionEvent } from '../../src/assistant/state';
import { testAssistant } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => {
  assistants.splice(0).forEach((a) => a.detach());
  document.body.replaceChildren();
});

type Check = Server['check'];

function setup(
  reply: string | null = ' will be processed within 3 working days.',
  checkImpl?: Check,
  opts: { text?: string; isMac?: boolean; dir?: 'ltr'; spelling?: 'off' | 'suggest'; polished?: string } = {},
) {
  document.body.innerHTML = `<div id="c" contenteditable="true"${opts.dir ? ` dir="${opts.dir}"` : ''}></div>`;
  const el = document.getElementById('c')!;
  el.textContent = opts.text ?? 'Thank you, your request';
  el.focus();
  document.getSelection()!.collapse(el.firstChild!, el.textContent.length);
  const check = vi.fn<Check>(checkImpl ?? (async () => (reply === null ? null : ({ mistakes: [], completion: reply } satisfies CheckReply))));
  /** How many requests asked for a completion (the others only check spelling). */
  const completionAsks = () => check.mock.calls.filter(([body]) => body.prefix !== null).length;
  const replace = vi.fn((range: Range, text: string) => {
    const node = range.startContainer as Text;
    node.insertData(range.startOffset, text);
    document.getSelection()!.collapse(node, range.startOffset + text.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
  });
  const polish = vi.fn<Server['polish']>(async (text) => ({ polished: opts.polished ?? text, changed: opts.polished !== undefined }));
  const { assistant, events: all } = testAssistant(el, {
    spelling: opts.spelling ?? 'off',
    completion: true,
    canned: ['Your request will be processed.'],
    kb: [],
    server: { check, polish },
    conversation: () => [{ role: 'customer', text: 'when will it be processed?' }],
    env: { replace, isMac: opts.isMac ?? false },
  });
  assistants.push(assistant);
  const completion = assistant.completion!;
  // Only the completion events (the server events carry request and reply text by design).
  const events = all as AssistEvent[];
  const completionEvents = () => events.filter((e): e is CompletionEvent => e.type.startsWith('completion-'));
  const ghostText = () => assistant.getState().ghost?.text ?? '';
  return { el, check, completionAsks, polish, events, completionEvents, replace, assistant, completion, ghostText };
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
    const { el, check, completionEvents, events, ghostText, assistant } = setup();
    await assistant.checkNow();
    expect(check).toHaveBeenCalledTimes(1);
    const [body] = check.mock.calls[0];
    expect(body.text).toBe('Thank you, your request');
    expect(body.prefix).toBe('Thank you, your request');
    expect(body.transcript).toEqual([{ role: 'customer', text: 'when will it be processed?' }]);
    expect(body.canned).toEqual(['Your request will be processed.']);
    expect(body.kb).toEqual([]);
    expect(ghostText()).toBe(' will be processed within 3 working days.');
    expect(assistant.getState().ghost?.layout).toMatchObject({ top: 60, left: 100, width: 400, textIndent: 108 });
    expect(el.innerHTML).toBe('Thank you, your request');
    expect(completionEvents()).toEqual([{ type: 'completion-shown', lang: 'en', latencyMs: expect.any(Number), shownLength: 41 }]);
    expect(events.map((e) => e.type)).toEqual(['check-request', 'check-reply', 'completion-shown']);
    expect(events[0]).toEqual({ type: 'check-request', text: 'Thank you, your request', completion: true, turns: 1, canned: 1, kb: 0 });
  });

  it('fires after the throttle on input', async () => {
    const { el, check } = setup();
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 't' }));
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  });

  it('ignores a reply that arrives after a keystroke', async () => {
    let resolve!: (v: CheckReply) => void;
    const slow: Check = () => new Promise<CheckReply>((r) => (resolve = r));
    const { el, assistant, ghostText } = setup(null, slow);
    const pending = assistant.checkNow();
    typeChar(el, 's');
    resolve({ mistakes: [], completion: ' late' });
    await pending;
    expect(ghostText()).toBe('');
  });

  it('Tab accepts once through replace, and the page never sees the Tab', async () => {
    const { el, replace, completionEvents, ghostText, assistant } = setup();
    await assistant.checkNow();
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
    const { el, completionEvents, ghostText, assistant } = setup();
    await assistant.checkNow();
    typeChar(el, ' ');
    typeChar(el, 'w');
    typeChar(el, 'i');
    expect(ghostText()).toBe('ll be processed within 3 working days.');
    typeChar(el, 'x');
    expect(ghostText()).toBe('');
    expect(completionEvents().at(-1)).toMatchObject({ type: 'completion-dismissed' });
  });

  it('Escape dismisses without reaching the page; Enter dismisses without being prevented', async () => {
    const { el, ghostText, assistant } = setup();
    await assistant.checkNow();
    const pageKeydown = vi.fn();
    el.addEventListener('keydown', pageKeydown);
    key('Escape', el);
    expect(pageKeydown).not.toHaveBeenCalled();
    expect(ghostText()).toBe('');
    await assistant.checkNow();
    expect(ghostText()).not.toBe('');
    const enter = key('Enter', el);
    expect(enter.defaultPrevented).toBe(false);
    expect(pageKeydown).toHaveBeenCalledTimes(1);
    expect(ghostText()).toBe('');
  });

  it('typing-through works from input events alone (execCommand and some IMEs fire no beforeinput)', async () => {
    const { el, ghostText, assistant } = setup();
    await assistant.checkNow();
    for (const ch of ' wi') {
      const node = el.firstChild as Text;
      node.appendData(ch);
      document.getSelection()!.collapse(node, node.length);
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch }));
    }
    expect(ghostText()).toBe('ll be processed within 3 working days.');
  });

  it('asks for no completion while the spelling popover is open', async () => {
    const { el, check, assistant } = setup(undefined, undefined, { text: 'I will recieve your request', spelling: 'suggest' });
    const mistake: Mistake = { word: 'recieve', fixes: ['receive'], sure: false };
    assistant.spelling!.applyMistakes([mistake]);
    document.getSelection()!.collapse(el.firstChild!, 9); // inside "recieve"
    key('.', el, { ctrlKey: true });
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    document.getSelection()!.collapse(el.firstChild!, el.textContent!.length);
    await assistant.checkNow();
    expect(check.mock.calls[0][0].prefix).toBeNull();
  });

  it('asks for no completion while the polish preview is open', async () => {
    const { check, assistant } = setup();
    await assistant.polishNow();
    expect(assistant.getState().polish.preview).toBeDefined();
    await assistant.checkNow();
    expect(check.mock.calls[0][0].prefix).toBeNull();
  });

  it('pressing Polish hides the ghost text', async () => {
    const { assistant, ghostText } = setup();
    await assistant.checkNow();
    expect(ghostText()).not.toBe('');
    await assistant.polishNow();
    expect(ghostText()).toBe('');
  });

  it('dismisses when the page clears the field (send)', async () => {
    const { el, ghostText, assistant } = setup();
    await assistant.checkNow();
    el.replaceChildren();
    await vi.waitFor(() => expect(ghostText()).toBe(''));
  });

  it('completion events never contain text', async () => {
    const { el, completionEvents, assistant } = setup();
    await assistant.checkNow();
    key('Tab', el);
    const json = JSON.stringify(completionEvents());
    expect(json).not.toContain('processed');
    expect(json).not.toContain('request');
  });

  it('shows nothing when the server has nothing (or is down)', async () => {
    const { check, assistant, ghostText } = setup(null);
    await assistant.checkNow();
    expect(check).toHaveBeenCalled();
    expect(ghostText()).toBe('');
  });

  it('dismiss() hides the ghost text and detach() clears it', async () => {
    const { completion, assistant, ghostText } = setup();
    await assistant.checkNow();
    completion.dismiss();
    expect(ghostText()).toBe('');
    await assistant.checkNow();
    completion.detach();
    expect(assistant.getState().ghost).toBeUndefined();
  });

  describe('forward arrow and word accept (Req 3.2)', () => {
    const AR_PREFIX = 'شكراً لتواصلك معنا، تم استلام طلبك';
    const AR_REPLY = ' وسيتم الرد عليك قريباً';
    const pause = () => new Promise((r) => setTimeout(r, 30));

    it('Right Arrow accepts an English suggestion, unseen by the page', async () => {
      const { el, replace, ghostText, assistant } = setup();
      await assistant.checkNow();
      const pageSaw = vi.fn();
      el.addEventListener('keydown', pageSaw);
      const e = key('ArrowRight', el);
      expect(e.defaultPrevented).toBe(true);
      expect(pageSaw).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' will be processed within 3 working days.');
      expect(ghostText()).toBe('');
    });

    it.each([[undefined], ['ltr' as const]])('Left Arrow accepts an Arabic suggestion (field dir %s)', async (dir) => {
      const { el, replace, ghostText, assistant } = setup(AR_REPLY, undefined, { text: AR_PREFIX, dir });
      await assistant.checkNow();
      expect(ghostText()).toBe(AR_REPLY);
      expect(key('ArrowLeft', el).defaultPrevented).toBe(true);
      expect(replace).toHaveBeenCalledWith(expect.anything(), AR_REPLY);
      expect(el.textContent).toBe(AR_PREFIX + AR_REPLY);
    });

    it('the backward arrow and Shift+Right dismiss without being prevented', async () => {
      const { el, replace, ghostText, assistant } = setup();
      await assistant.checkNow();
      expect(key('ArrowLeft', el).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      await assistant.checkNow();
      expect(key('ArrowRight', el, { shiftKey: true }).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
      expect(replace).not.toHaveBeenCalled();
    });

    it('the Right Arrow dismisses an Arabic suggestion', async () => {
      const ar = setup(AR_REPLY, undefined, { text: AR_PREFIX });
      await ar.assistant.checkNow();
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
      const { el, replace, ghostText, completionAsks, assistant } = setup();
      await assistant.checkNow();
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(true);
      key('ArrowRight', el, { ctrlKey: true });
      expect(replace.mock.calls.map((c) => c[1])).toEqual([' will', ' be']);
      expect(el.textContent).toBe('Thank you, your request will be');
      expect(ghostText()).toBe(' processed within 3 working days.');
      await pause();
      expect(completionAsks()).toBe(1); // no new request while words remain
    });

    it('Ctrl+Left accepts an Arabic word', async () => {
      const { el, replace, ghostText, assistant } = setup(AR_REPLY, undefined, { text: AR_PREFIX });
      await assistant.checkNow();
      key('ArrowLeft', el, { ctrlKey: true });
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' وسيتم');
      expect(ghostText()).toBe(' الرد عليك قريباً');
    });

    it('on macOS, Option+Right accepts a word and Ctrl+Right dismisses', async () => {
      const { el, replace, ghostText, assistant } = setup(undefined, undefined, { isMac: true });
      await assistant.checkNow();
      key('ArrowRight', el, { altKey: true });
      expect(replace).toHaveBeenCalledWith(expect.anything(), ' will');
      expect(key('ArrowRight', el, { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(ghostText()).toBe('');
    });

    it('mixes word accept, typing through and Tab', async () => {
      const { el, replace, ghostText, assistant } = setup();
      await assistant.checkNow();
      key('ArrowRight', el, { ctrlKey: true });
      for (const ch of ' be') typeChar(el, ch);
      expect(ghostText()).toBe(' processed within 3 working days.');
      key('Tab', el);
      expect(replace.mock.calls.at(-1)![1]).toBe(' processed within 3 working days.');
      expect(el.textContent).toBe('Thank you, your request will be processed within 3 working days.');
    });

    it('after the last word, the next pause requests a new completion', async () => {
      const { el, ghostText, completionAsks, assistant } = setup(' is received'); // no full stop: the sentence can continue
      await assistant.checkNow();
      key('ArrowRight', el, { ctrlKey: true });
      key('ArrowRight', el, { ctrlKey: true });
      expect(ghostText()).toBe('');
      await vi.waitFor(() => expect(completionAsks()).toBe(2));
    });
  });

  describe('events for partial accepts', () => {
    it('a partly accepted suggestion ends as accepted with the accepted length', async () => {
      const { el, completionEvents, assistant } = setup(' will be processed within 3 working days');
      await assistant.checkNow();
      key('ArrowRight', el, { ctrlKey: true });
      typeChar(el, 'X');
      const events = completionEvents();
      expect(events.map((e) => e.type)).toEqual(['completion-shown', 'completion-accepted']);
      expect(events[1]).toMatchObject({ shownLength: 40, acceptedLength: 5 });
    });

    it('the forward arrow reports the full length', async () => {
      const { el, completionEvents, assistant } = setup();
      await assistant.checkNow();
      key('ArrowRight', el);
      expect(completionEvents()[1]).toMatchObject({ type: 'completion-accepted', shownLength: 41, acceptedLength: 41 });
    });

    it('typing through then Tab reports the full length', async () => {
      const { el, completionEvents, assistant } = setup();
      await assistant.checkNow();
      for (const ch of ' wi') typeChar(el, ch);
      key('Tab', el);
      expect(completionEvents().at(-1)).toMatchObject({ type: 'completion-accepted', shownLength: 41, acceptedLength: 41 });
    });

    it('word-accept events contain no text', async () => {
      const { el, completionEvents, assistant } = setup();
      await assistant.checkNow();
      key('ArrowRight', el, { ctrlKey: true });
      key('Escape', el);
      const json = JSON.stringify(completionEvents());
      expect(json).not.toContain('will');
      expect(json).not.toContain('request');
    });
  });
});
