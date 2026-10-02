// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachSpellCheck, type AssistEvent } from '../../src/composer';
import { composer, fakeHighlightEnv, fakeService, placeCaret, textReplace, typeChars } from './fakes';

const handles: { detach(): void }[] = [];
afterEach(() => {
  handles.splice(0).forEach((h) => h.detach());
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const BAD = { en: ['seperate', 'Seperate', 'recieve', 'paymnet', 'GOSSI', 'teh'], ar: ['النضام', 'اذا', 'التامينات'] };

function setup(opts: { customWords?: string[] } = {}) {
  const el = composer('');
  const hl = fakeHighlightEnv();
  const svc = fakeService(BAD);
  const events: AssistEvent[] = [];
  const replace = vi.fn(textReplace(el));
  const handle = attachSpellCheck(el, {
    service: svc.service,
    mode: 'auto',
    debounceMs: 1,
    flashMs: 30,
    customWords: opts.customWords,
    onEvent: (e) => events.push(e),
    env: { highlights: hl.env, replace, rectOf: () => new DOMRect(10, 10, 40, 16) },
  });
  handles.push(handle);
  return { el, hl, svc, events, replace, handle };
}

const flashed = (hl: ReturnType<typeof fakeHighlightEnv>) => [...(hl.registered.get('bp-autocorrected') ?? [])].map((r) => r.toString());

describe('auto-correct in the composer', () => {
  it('corrects a clear slip after a typed space, flashes it and reports it', async () => {
    const { el, hl, events, handle } = setup();
    typeChars(el, 'please seperate ');
    await handle.settled();
    expect(el.textContent).toBe('please separate ');
    expect(flashed(hl)).toEqual(['separate']);
    expect(events).toEqual([{ type: 'autocorrect', lang: 'en', original: 'seperate', replacement: 'separate' }]);
    await vi.waitFor(() => expect(flashed(hl)).toEqual([]));
  });

  it('corrects Arabic, including a short hamza slip', async () => {
    const { el, handle } = setup();
    typeChars(el, 'النضام اذا ');
    await handle.settled();
    expect(el.textContent).toBe('النظام إذا ');
  });

  it('leaves ambiguous, short and all-caps words as typed', async () => {
    const { el, replace, handle } = setup();
    typeChars(el, 'recieve teh GOSSI التامينات ');
    await handle.settled();
    expect(el.textContent).toBe('recieve teh GOSSI التامينات ');
    expect(replace).not.toHaveBeenCalled();
  });

  it('preserves capitalization and corrects each language in a mixed sentence', async () => {
    const { el, handle } = setup();
    typeChars(el, 'Seperate النضام paymnet ');
    await handle.settled();
    expect(el.textContent).toBe('Separate النظام payment ');
  });

  it('keeps the caret where the agent is typing', async () => {
    const { el, svc, handle } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate t'); // decision lands after the "t"
    release();
    await handle.settled();
    expect(el.textContent).toBe('separate t');
    const sel = document.getSelection()!;
    expect(sel.anchorNode!.textContent!.slice(0, sel.anchorOffset)).toBe('separate t');
  });

  it('does not apply if the word changed before the decision arrived', async () => {
    const { el, svc, replace, handle } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate ');
    (el.firstChild as Text).replaceData(0, 8, 'separete');
    release();
    await handle.settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not insert anything once the composer was cleared (message sent)', async () => {
    const { el, svc, replace, handle } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate ');
    el.replaceChildren();
    release();
    await handle.settled();
    expect(replace).not.toHaveBeenCalled();
    expect(el.textContent).toBe('');
  });

  it('ignores paste and host insertions', async () => {
    const { el, replace, handle } = setup();
    el.textContent = 'please seperate ';
    placeCaret(el.firstChild!, 16);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'please seperate ' }));
    await handle.settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('never corrects custom dictionary words', async () => {
    const { el, replace, handle } = setup({ customWords: ['seperate'] });
    typeChars(el, 'seperate ');
    await handle.settled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('reverting an auto-correction', () => {
  const popover = () => document.querySelector<HTMLElement>('[data-bp-spell-popover]');
  const options = () => [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')];

  it('offers "Revert to original" in the popover, restores it once, and never corrects it again', async () => {
    const { el, events, replace, handle } = setup();
    typeChars(el, 'النضام ');
    await handle.settled();
    expect(el.textContent).toBe('النظام ');
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    expect(popover()!.dir).toBe('rtl');
    expect(options().map((o) => o.textContent)).toEqual(['Revert to النضام']);
    replace.mockClear();
    options()[0].click();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('النضام ');
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
    // not corrected or underlined again
    typeChars(el, 'النضام ');
    await handle.settled();
    await handle.recheck();
    expect(el.textContent).toBe('النضام النضام ');
  });

  it('offers no Revert once the agent edited the corrected word', async () => {
    const { el, handle } = setup();
    typeChars(el, 'seperate ');
    await handle.settled();
    (el.firstChild as Text).replaceData(0, 8, 'separated');
    await handle.recheck();
    placeCaret(el.firstChild!, 3);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(options().some((o) => o.textContent?.startsWith('Revert'))).toBe(false);
  });

  it('treats an Undo that restores the original as a revert', async () => {
    const { el, events, handle } = setup();
    typeChars(el, 'please seperate ');
    await handle.settled();
    // what the browser does on Undo: put the original back, fire historyUndo
    (el.firstChild as Text).replaceData(7, 8, 'seperate');
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
    typeChars(el, 'seperate ');
    await handle.settled();
    expect(el.textContent).toBe('please seperate seperate ');
  });

  it('emits accept and ignore from the suggestion popover', async () => {
    const { el, events, handle } = setup();
    typeChars(el, 'recieve ');
    await handle.settled();
    await handle.recheck();
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    options().find((o) => o.textContent === 'Ignore')!.click();
    expect(events).toEqual([{ type: 'ignore', lang: 'en', original: 'recieve' }]);
  });

  it('emits accept when a suggestion is chosen', async () => {
    const { el, events, handle } = setup();
    typeChars(el, 'recieve ');
    await handle.settled();
    await handle.recheck();
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    options().find((o) => o.textContent === 'receive')!.click();
    expect(el.textContent).toBe('receive ');
    expect(events).toEqual([{ type: 'accept', lang: 'en', original: 'recieve', replacement: 'receive' }]);
  });
});
