// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from '../../src/assistant/server';
import { testAssistant } from './fakes';

const detachers: (() => void)[] = [];
afterEach(() => {
  detachers.splice(0).forEach((d) => d());
  document.body.replaceChildren();
});

function setup(html: string, polished: string | null, changed = true, completion = false) {
  document.body.innerHTML = `<div id="c" contenteditable="true">${html}</div>`;
  const el = document.getElementById('c')!;
  const polish = vi.fn<Server['polish']>(async (text) =>
    polished === null ? null : { polished: changed ? polished : text, changed },
  );
  const check = vi.fn<Server['check']>(async () => ({ mistakes: [], completion: ' x' }));
  const replace = vi.fn((range: Range, text: string) => {
    if (range.startContainer === range.endContainer) (range.startContainer as Text).replaceData(range.startOffset, range.endOffset - range.startOffset, text);
    else {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    }
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
  });
  const t = testAssistant(el, { spelling: 'off', completion, server: { polish, check }, env: { replace } });
  detachers.push(() => t.assistant.detach());
  const polishEvents = () => t.events.filter((e) => e.type.startsWith('polish-') && !['polish-request', 'polish-reply'].includes(e.type));
  return { ...t, el, polish, check, replace, polishEvents, state: () => t.assistant.getState().polish };
}

const segments = (state: ReturnType<ReturnType<typeof setup>['state']>, type: 'ins' | 'del') =>
  (state.preview?.segments ?? []).filter((s) => s.type === type).map((s) => s.text);

describe('polish', () => {
  it('can polish from 3 words on', async () => {
    const { el, state } = setup('Hi there', 'Hi there');
    expect(state().canPolish).toBe(false);
    el.textContent = 'Hi there friend';
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver
    expect(state().canPolish).toBe(true);
  });

  it('shows the changes as ins/del and logs polish-shown without text', async () => {
    const { assistant, polishEvents, state } = setup('He go to the office and buyed a pen.', 'He went to the office and bought a pen.');
    await assistant.polishNow();
    expect(state().busy).toBe(false);
    expect(segments(state(), 'del')).toEqual(['go', 'buyed']);
    expect(segments(state(), 'ins')).toEqual(['went', 'bought']);
    expect(polishEvents()).toEqual([{ type: 'polish-shown', lang: 'en', latencyMs: expect.any(Number), changes: 2 }]);
  });

  it('lays out the preview right to left for Arabic drafts', async () => {
    const { assistant, state } = setup('تم استلام هذه الطلب وسيتم معالجته.', 'تم استلام هذا الطلب وسيتم معالجته.');
    await assistant.polishNow();
    expect(state().preview!.dir).toBe('rtl');
  });

  it('dismiss closes the preview and leaves the draft', async () => {
    const { el, assistant, polishEvents, state } = setup('He go to the office.', 'He went to the office.');
    await assistant.polishNow();
    assistant.dismissPolish();
    expect(state().preview).toBeUndefined();
    expect(el.textContent).toBe('He go to the office.');
    expect(polishEvents().at(-1)).toEqual({ type: 'polish-dismissed', lang: 'en' });
  });

  it('accept applies, closes and logs polish-accepted without text', async () => {
    const { el, assistant, replace, polishEvents, state } = setup('He go to the office.', 'He went to the office.');
    await assistant.polishNow();
    assistant.acceptPolish();
    expect(replace).toHaveBeenCalledOnce();
    expect(el.textContent).toBe('He went to the office.');
    expect(state().preview).toBeUndefined();
    expect(state().revertable).toBe(false); // one change: Ctrl/Cmd+Z undoes it
    expect(polishEvents().at(-1)).toEqual({ type: 'polish-accepted', lang: 'en', changes: 1 });
    expect(JSON.stringify(polishEvents())).not.toMatch(/went|office/);
  });

  it('offers Revert polish after a formatted accept, and refuses a stale draft', async () => {
    const { el, assistant, polishEvents, state } = setup('He go to <b>the office</b> and buyed a pen.', 'He went to the office and bought a pen.');
    await assistant.polishNow();
    assistant.acceptPolish();
    expect(el.innerHTML).toBe('He went to <b>the office</b> and bought a pen.');
    expect(state().revertable).toBe(true);
    assistant.revertPolish();
    expect(el.innerHTML).toBe('He go to <b>the office</b> and buyed a pen.');
    expect(state().revertable).toBe(false);
    expect(polishEvents().at(-1)).toEqual({ type: 'polish-reverted', lang: 'en' });

    await assistant.polishNow();
    (el.lastChild as Text).appendData(' Thanks');
    assistant.acceptPolish();
    expect(state().preview!.message).toMatch(/Polish again/);
    expect(state().preview!.segments).toEqual([]);
    expect(el.textContent).toContain('buyed');
  });

  it('shows only a message when there is nothing to fix or the server is down', async () => {
    const none = setup('Your request has been received.', 'x', false);
    await none.assistant.polishNow();
    expect(none.state().preview).toEqual({ dir: 'ltr', segments: [], message: expect.stringMatching(/No changes/) });
    none.assistant.dismissPolish();
    expect(none.state().preview).toBeUndefined();
    const down = setup('Your request has been received.', null);
    await down.assistant.polishNow();
    expect(down.state().preview!.message).toMatch(/unavailable/);
  });

  it('asks for no completion while the preview is open', async () => {
    const { el, assistant, check } = setup('He go to the office today.', 'He went to the office today.', true, true);
    await assistant.polishNow();
    el.focus();
    document.getSelection()!.collapse(el.firstChild!, el.textContent!.length);
    await assistant.checkNow();
    expect(check.mock.calls[0][0].prefix).toBeNull();
  });
});
