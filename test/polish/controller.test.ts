// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCompletion } from '../../src/completion/controller';
import type { PolishFetcher } from '../../src/polish/client';
import { attachPolish, type PolishEvent } from '../../src/polish/controller';

const handles: { detach(): void }[] = [];
afterEach(() => {
  handles.splice(0).forEach((h) => h.detach());
  document.body.replaceChildren();
});

function setup(html: string, polished: string | null, changed = true) {
  document.body.innerHTML = `<div id="c" contenteditable="true">${html}</div>`;
  const el = document.getElementById('c')!;
  const fetcher = vi.fn<PolishFetcher>(async (text) =>
    polished === null ? null : { polished: changed ? polished : text, changed, lang: 'en', latencyMs: 5, model: 'fake' },
  );
  const events: PolishEvent[] = [];
  const onOpen = vi.fn();
  const replace = vi.fn((range: Range, text: string) => {
    if (range.startContainer === range.endContainer) (range.startContainer as Text).replaceData(range.startOffset, range.endOffset - range.startOffset, text);
    else {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    }
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text }));
  });
  const handle = attachPolish(el, { fetcher, onEvent: (e) => events.push(e), onOpen, env: { replace } });
  handles.push(handle);
  return { el, fetcher, events, onOpen, replace, handle };
}

const button = () => document.querySelector<HTMLButtonElement>('[data-bp-polish-button]')!;
const panel = () => document.querySelector<HTMLElement>('[data-bp-polish-panel]');
const panelButton = (label: string) => [...(panel()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);

describe('polish controller', () => {
  it('shows a disabled button for short drafts and enables it at 3 words', () => {
    const { el } = setup('Hi there', 'Hi there');
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-label')).toBe('Polish grammar and spelling');
    el.textContent = 'Hi there friend';
    el.dispatchEvent(new Event('input'));
    expect(button().disabled).toBe(false);
    expect(el.contains(button())).toBe(false);
  });

  it('calls onOpen, renders ins/del, and emits polish-shown without text', async () => {
    const { onOpen, events, handle } = setup('He go to the office and buyed a pen.', 'He went to the office and bought a pen.');
    await handle.polishNow();
    expect(onOpen).toHaveBeenCalledOnce();
    expect([...panel()!.querySelectorAll('del')].map((d) => d.textContent)).toEqual(['go', 'buyed']);
    expect([...panel()!.querySelectorAll('ins')].map((d) => d.textContent)).toEqual(['went', 'bought']);
    expect(events).toEqual([{ type: 'polish-shown', lang: 'en', latencyMs: expect.any(Number), changes: 2 }]);
  });

  it('lays out the panel right to left for Arabic drafts', async () => {
    const { handle } = setup('تم استلام هذه الطلب وسيتم معالجته.', 'تم استلام هذا الطلب وسيتم معالجته.');
    await handle.polishNow();
    expect(panel()!.querySelector('[dir]')!.getAttribute('dir')).toBe('rtl');
  });

  it('Escape closes without reaching the host and leaves the draft', async () => {
    const { el, events, handle } = setup('He go to the office.', 'He went to the office.');
    await handle.polishNow();
    const host = vi.fn();
    el.addEventListener('keydown', host);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(host).not.toHaveBeenCalled();
    expect(panel()).toBeNull();
    expect(el.textContent).toBe('He go to the office.');
    expect(events.at(-1)).toEqual({ type: 'polish-dismissed', lang: 'en' });
  });

  it('Accept applies, closes and emits polish-accepted without text', async () => {
    const { el, events, replace, handle } = setup('He go to the office.', 'He went to the office.');
    await handle.polishNow();
    panelButton('Accept')!.click();
    expect(replace).toHaveBeenCalledOnce();
    expect(el.textContent).toBe('He went to the office.');
    expect(panel()).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'polish-accepted', lang: 'en', changes: 1 });
    expect(JSON.stringify(events)).not.toMatch(/went|office/);
  });

  it('offers Revert polish after a formatted accept, and refuses a stale draft', async () => {
    const { el, events, handle } = setup('He go to <b>the office</b> and buyed a pen.', 'He went to the office and bought a pen.');
    await handle.polishNow();
    panelButton('Accept')!.click();
    expect(el.innerHTML).toBe('He went to <b>the office</b> and bought a pen.');
    const revert = document.querySelector<HTMLElement>('[data-bp-polish-toast] button')!;
    revert.click();
    expect(el.innerHTML).toBe('He go to <b>the office</b> and buyed a pen.');
    expect(events.at(-1)).toEqual({ type: 'polish-reverted', lang: 'en' });

    await handle.polishNow();
    (el.lastChild as Text).appendData(' Thanks');
    panelButton('Accept')!.click();
    expect(panel()!.textContent).toMatch(/Polish again/);
    expect(el.textContent).toContain('buyed');
  });

  it('shows only Close when there is nothing to fix or the service is down', async () => {
    const none = setup('Your request has been received.', 'x', false);
    await none.handle.polishNow();
    expect(panel()!.textContent).toMatch(/No changes/);
    expect(panelButton('Accept')).toBeUndefined();
    panelButton('Close')!.click();
    const down = setup('Your request has been received.', null);
    await down.handle.polishNow();
    expect(panel()!.textContent).toMatch(/unavailable/);
    expect(panelButton('Close')).toBeDefined();
  });

  it('completion requests nothing while the panel is open, and detach removes all overlays', async () => {
    const { el, handle } = setup('He go to the office today.', 'He went to the office today.');
    const completionFetcher = vi.fn(async () => ({ completion: ' x', lang: 'en' as const, latencyMs: 1, model: 'f', sources: [] }));
    const completion = attachCompletion(el, { fetcher: completionFetcher, env: { replace: vi.fn(), measure: { caretRect: () => null, contentBox: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) } } });
    handles.push(completion);
    await handle.polishNow();
    el.focus();
    document.getSelection()!.collapse(el.firstChild!, el.textContent!.length);
    await completion.requestNow();
    expect(completionFetcher).not.toHaveBeenCalled();
    handle.detach();
    expect(document.querySelector('[data-bp-polish-button], [data-bp-polish-panel], [data-bp-polish-toast]')).toBeNull();
  });
});
