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

const BAD = {
  en: ['seperate', 'Seperate', 'recieve', 'paymnet', 'GOSSI', 'teh', 'oNly', 'info', 'gosi', 'https', 'www'],
  ar: ['النضام', 'اذا', 'التامينات', 'المستخذم', 'حتىى'],
};

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

  it('corrects clear Arabic slips and leaves words with many neighbors underlined', async () => {
    const { el, hl, handle } = setup();
    typeChars(el, 'المستخذم حتىى النضام اذا ');
    await handle.settled();
    expect(el.textContent).toBe('المستخدم حتى النضام اذا ');
    await handle.recheck();
    expect(hl.words()).toEqual(['النضام', 'اذا']);
  });

  it('fixes only the case of a stray capital', async () => {
    const { el, handle } = setup();
    typeChars(el, 'oNly ');
    await handle.settled();
    expect(el.textContent).toBe('only ');
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
    typeChars(el, 'Seperate المستخذم paymnet ');
    await handle.settled();
    expect(el.textContent).toBe('Separate المستخدم payment ');
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

describe('words completed by . @ : / (KI-2)', () => {
  const step = async (el: HTMLElement, handle: { settled(): Promise<void> }, chars: string) => {
    typeChars(el, chars);
    await handle.settled();
    return el.textContent;
  };

  it('holds a word before a full stop until the next space', async () => {
    const { el, handle } = setup();
    expect(await step(el, handle, 'please seperate.')).toBe('please seperate.');
    expect(await step(el, handle, ' ')).toBe('please separate. ');
  });

  it('holds an Arabic word before a full stop', async () => {
    const { el, handle } = setup();
    expect(await step(el, handle, 'رقم المستخذم.')).toBe('رقم المستخذم.');
    expect(await step(el, handle, ' ')).toBe('رقم المستخدم. ');
  });

  it('decides at once after a comma', async () => {
    const { el, handle } = setup();
    expect(await step(el, handle, 'please seperate,')).toBe('please separate,');
  });

  it.each(['email info@gosi.gov.sa ', 'visit https://www.gosi.gov.sa/en ', 'راسلنا على info@gosi.gov.sa '])(
    'never touches an address typed by hand: %s',
    async (text) => {
      const { el, replace, handle } = setup();
      for (const ch of text) expect(await step(el, handle, ch)).toBe(text.slice(0, el.textContent!.length));
      expect(el.textContent).toBe(text);
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it('decides a held word on a line break', async () => {
    const { el, handle } = setup();
    typeChars(el, 'please seperate.');
    el.append(document.createElement('br'));
    placeCaret(el, el.childNodes.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertLineBreak' }));
    await handle.settled();
    expect(el.textContent).toBe('please separate.');
    expect(el.querySelector('br')).not.toBeNull();
  });

  it('drops a held word when whitespace is typed elsewhere', async () => {
    const { el, replace, handle } = setup();
    typeChars(el, 'please seperate.');
    (el.firstChild as Text).insertData(0, ' ');
    placeCaret(el.firstChild!, 1);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    await handle.settled();
    expect(el.textContent).toBe(' please seperate.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('drops held words when the message is sent', async () => {
    const { el, replace, handle } = setup();
    typeChars(el, 'please seperate.');
    el.replaceChildren(); // host clears the composer on Enter-to-send
    await handle.recheck();
    typeChars(el, 'hello ');
    await handle.settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('reverts a held word\'s replacement with one Undo', async () => {
    const { el, events, handle } = setup();
    typeChars(el, 'please seperate. ');
    await handle.settled();
    expect(el.textContent).toBe('please separate. ');
    (el.firstChild as Text).replaceData(7, 8, 'seperate');
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
  });
});

describe('reverting an auto-correction', () => {
  const popover = () => document.querySelector<HTMLElement>('[data-bp-spell-popover]');
  const options = () => [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')];

  it('offers "Revert to original" in the popover, restores it once, and never corrects it again', async () => {
    const { el, events, replace, handle } = setup();
    typeChars(el, 'المستخذم ');
    await handle.settled();
    expect(el.textContent).toBe('المستخدم ');
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    expect(popover()!.dir).toBe('rtl');
    expect(options().map((o) => o.textContent)).toEqual(['Revert to المستخذم']);
    replace.mockClear();
    options()[0].click();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('المستخذم ');
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
    // not corrected or underlined again
    typeChars(el, 'المستخذم ');
    await handle.settled();
    await handle.recheck();
    expect(el.textContent).toBe('المستخذم المستخذم ');
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
