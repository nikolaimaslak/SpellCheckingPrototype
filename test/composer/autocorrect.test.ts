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
  en: ['seperate', 'Seperate', 'recieve', 'Fatimah', 'Harbi', 'Noura', 'Almarai', 'paymnet', 'GOSSI', 'teh', 'Teh', 'TEH', 'tge', 'afte', 'oNly', 'info', 'gosi', 'https', 'www'],
  ar: ['النضام', 'نوره', 'اذا', 'الى', 'ان', 'التامينات', 'المستخذم', 'حتىى'],
};

function setup(
  opts: { customWords?: string[]; mode?: 'suggest' | 'auto'; autoReplace?: 'list' | 'list-and-rule'; conversation?: { role: string; text: string }[] } = {},
) {
  const el = composer('');
  const hl = fakeHighlightEnv();
  const svc = fakeService(BAD);
  const events: AssistEvent[] = [];
  const replace = vi.fn(textReplace(el));
  const handle = attachSpellCheck(el, {
    service: svc.service,
    mode: opts.mode ?? 'auto',
    autoReplace: opts.autoReplace,
    conversation: opts.conversation && (() => opts.conversation!),
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
    typeChars(el, 'المستخذم حتىى النضام ان ');
    await handle.settled();
    expect(el.textContent).toBe('المستخدم حتى النضام ان ');
    await handle.recheck();
    expect(hl.words()).toEqual(['النضام', 'ان']);
  });

  it('fixes only the case of a stray capital', async () => {
    const { el, handle } = setup();
    typeChars(el, 'oNly ');
    await handle.settled();
    expect(el.textContent).toBe('only ');
  });

  it('leaves ambiguous, short and all-caps words as typed', async () => {
    const { el, replace, handle } = setup();
    typeChars(el, 'afte tge GOSSI TEH ان ');
    await handle.settled();
    expect(el.textContent).toBe('afte tge GOSSI TEH ان ');
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

describe('known misspellings', () => {
  const popover = () => document.querySelector<HTMLElement>('[data-bp-spell-popover]');
  const optionTexts = () => [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')].map((o) => o.textContent);

  it('fixes listed words whatever their length, keeping a leading capital', async () => {
    const { el, handle } = setup();
    typeChars(el, 'teh. Teh ');
    await handle.settled();
    expect(el.textContent).toBe('the. The ');
  });

  it('fixes a listed Arabic hamza slip', async () => {
    const { el, handle } = setup();
    typeChars(el, 'اذا كان');
    await handle.settled();
    expect(el.textContent).toBe('إذا كان');
  });

  it('at list-only confidence fixes only listed words', async () => {
    const { el, hl, handle } = setup({ autoReplace: 'list' });
    typeChars(el, 'teh paymnet ');
    await handle.settled();
    expect(el.textContent).toBe('the paymnet ');
    await handle.recheck();
    expect(hl.words()).toEqual(['paymnet']);
  });

  it('sends no neighbors request for a listed word', async () => {
    const { el, svc, handle } = setup();
    typeChars(el, 'teh paymnet ');
    await handle.settled();
    expect(svc.neighborRequests).toEqual(['paymnet']);
  });

  it('does not fix a reverted listed word again', async () => {
    const { el, handle } = setup();
    typeChars(el, 'teh ');
    await handle.settled();
    (el.firstChild as Text).replaceData(0, 3, 'teh');
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    typeChars(el, 'teh ');
    await handle.settled();
    expect(el.textContent).toBe('teh teh ');
  });

  it.each([
    ['teh ', 'the', 'ltr'],
    ['الى ', 'إلى', 'rtl'],
  ])('offers the list fix first in suggest mode: %s', async (typed, first, dir) => {
    const { el, handle } = setup({ mode: 'suggest' });
    typeChars(el, typed);
    await handle.recheck();
    placeCaret(el.firstChild!, 1);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    expect(optionTexts()[0]).toBe(first);
    expect(optionTexts().filter((t) => t === first)).toHaveLength(1);
    expect(popover()!.dir).toBe(dir);
  });
});

describe('names (Req 4.2.2)', () => {
  it.each(['Dear Ms. Fatimah, ', 'Dear Mr. Al-Harbi, '])('leaves a capitalized name in mid-sentence: %s', async (text) => {
    const { el, replace, handle } = setup();
    typeChars(el, text);
    await handle.settled();
    expect(el.textContent).toBe(text);
    expect(replace).not.toHaveBeenCalled();
  });

  it('still fixes a capitalized typo that starts a sentence', async () => {
    const { el, handle } = setup();
    typeChars(el, 'Thanks. Seperate forms ');
    await handle.settled();
    expect(el.textContent).toBe('Thanks. Separate forms ');
  });

  it('leaves words the customer wrote, in English and Arabic', async () => {
    const conversation = [
      { role: 'customer', text: 'Hello, this is Noura' },
      { role: 'customer', text: 'معك نوره من الرياض' },
      { role: 'customer', text: 'my employer is Almarai' },
    ];
    const { el, replace, handle } = setup({ conversation });
    typeChars(el, 'Noura, thank you. شكراً نوره، ');
    await handle.settled();
    expect(el.textContent).toBe('Noura, thank you. شكراً نوره، ');
    typeChars(el, 'تم تحديث بيانات Almarai والنضام ');
    await handle.settled();
    expect(el.textContent).toContain('Almarai');
    expect(replace).not.toHaveBeenCalled();
  });

  it('without a conversation, a name that starts a sentence follows the other rules', async () => {
    const { el, handle } = setup();
    typeChars(el, 'Noura, ');
    await handle.settled();
    expect(el.textContent).toBe('Nora, ');
  });
});

describe('Backspace right after a correction (Req 4.2.1)', () => {
  const backspace = (el: HTMLElement, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  };
  const caretText = () => {
    const sel = document.getSelection()!;
    return sel.anchorNode!.textContent!.slice(0, sel.anchorOffset);
  };

  it('restores the word, keeps the space and the caret, and is never seen by the host', async () => {
    const { el, events, replace, handle } = setup();
    const host = vi.fn();
    el.addEventListener('keydown', host);
    typeChars(el, 'please seperate ');
    await handle.settled();
    expect(el.textContent).toBe('please separate ');
    replace.mockClear();
    const e = backspace(el);
    expect(e.defaultPrevented).toBe(true);
    expect(host).not.toHaveBeenCalled();
    expect(el.textContent).toBe('please seperate ');
    expect(caretText()).toBe('please seperate ');
    expect(replace).toHaveBeenCalledTimes(1); // one undo step
    expect(events.map((x) => x.type)).toEqual(['autocorrect', 'revert']);
    typeChars(el, 'seperate ');
    await handle.settled();
    expect(el.textContent).toBe('please seperate seperate ');
  });

  it('reverts an Arabic correction', async () => {
    const { el, handle } = setup();
    typeChars(el, 'رقم المستخذم ');
    await handle.settled();
    expect(el.textContent).toBe('رقم المستخدم ');
    expect(backspace(el).defaultPrevented).toBe(true);
    expect(el.textContent).toBe('رقم المستخذم ');
  });

  it('deletes normally when the agent typed more before the correction landed', async () => {
    const { el, svc, handle } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate t');
    release();
    await handle.settled();
    expect(el.textContent).toBe('separate t');
    expect(backspace(el).defaultPrevented).toBe(false);
    expect(el.textContent).toBe('separate t');
  });

  it('deletes normally when it is not the next key after the correction', async () => {
    const { el, handle } = setup();
    typeChars(el, 'please seperate ');
    await handle.settled();
    typeChars(el, 'x');
    const node = el.firstChild as Text;
    node.deleteData(node.length - 1, 1);
    document.getSelection()!.collapse(node, node.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward' }));
    expect(backspace(el).defaultPrevented).toBe(false);
    expect(el.textContent).toBe('please separate ');
  });

  it('Ctrl+Backspace is not a revert', async () => {
    const { el, handle } = setup();
    typeChars(el, 'please seperate ');
    await handle.settled();
    expect(backspace(el, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(el.textContent).toBe('please separate ');
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
    typeChars(el, 'afte ');
    await handle.settled();
    await handle.recheck();
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    options().find((o) => o.textContent === 'Ignore')!.click();
    expect(events).toEqual([
      { type: 'flag', lang: 'en', original: 'afte' },
      { type: 'ignore', lang: 'en', original: 'afte' },
    ]);
  });

  it('emits accept when a suggestion is chosen', async () => {
    const { el, events, handle } = setup();
    typeChars(el, 'afte ');
    await handle.settled();
    await handle.recheck();
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    options().find((o) => o.textContent === 'after')!.click();
    expect(el.textContent).toBe('after ');
    expect(events).toEqual([
      { type: 'flag', lang: 'en', original: 'afte' },
      { type: 'accept', lang: 'en', original: 'afte', replacement: 'after', rank: 4, offered: 5 },
    ]);
  });
});
