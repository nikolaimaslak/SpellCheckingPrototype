// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/assistant';
import type { Turn } from '../../src/assistant/server';
import { fakeChecker, fakeHighlightEnv, field, placeCaret, textReplace, testAssistant, typeChars } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => {
  assistants.splice(0).forEach((a) => a.detach());
  document.body.replaceChildren();
});

const BAD = {
  en: ['seperate', 'Seperate', 'recieve', 'Fatimah', 'Harbi', 'Noura', 'Almarai', 'paymnet', 'GOSSI', 'teh', 'Teh', 'TEH', 'tge', 'afte', 'oNly', 'info', 'gosi', 'https', 'www'],
  ar: ['النضام', 'نوره', 'اذا', 'الى', 'ان', 'التامينات', 'المستخذم', 'حتىى'],
};

function setup(
  opts: { customWords?: string[]; mode?: 'suggest' | 'auto'; autoReplace?: 'list' | 'list-and-rule'; conversation?: Turn[] } = {},
) {
  const el = field('');
  const svc = fakeChecker(BAD);
  const replace = vi.fn(textReplace(el));
  const { assistant, hl, events } = testAssistant(el, {
    checker: svc.checker,
    spelling: opts.mode ?? 'auto',
    autoReplace: opts.autoReplace ?? 'list-and-rule',
    conversation: () => opts.conversation ?? [],
    customWords: opts.customWords ?? [],
    env: { replace },
  });
  assistants.push(assistant);
  return { el, hl, svc, events, replace, assistant, spelling: assistant.spelling! };
}

/** Opens the popover for the word at the caret, as a click does. */
const clickWord = async (el: HTMLElement, assistant: Assistant) => {
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
  return assistant.getState().popover!;
};

const flashed = (hl: ReturnType<typeof fakeHighlightEnv>) => [...(hl.registered.get('bp-autocorrected') ?? [])].map((r) => r.toString());

describe('auto-correct in the composer', () => {
  it('corrects a clear slip after a typed space, flashes it and reports it', async () => {
    const { el, hl, events, spelling } = setup();
    typeChars(el, 'please seperate ');
    await spelling.settled();
    expect(el.textContent).toBe('please separate ');
    expect(flashed(hl)).toEqual(['separate']);
    expect(events).toEqual([{ type: 'autocorrect', lang: 'en', original: 'seperate', replacement: 'separate' }]);
  });

  it('corrects clear Arabic slips and leaves words with many neighbors underlined', async () => {
    const { el, hl, spelling } = setup();
    typeChars(el, 'المستخذم حتىى النضام ان ');
    await spelling.settled();
    expect(el.textContent).toBe('المستخدم حتى النضام ان ');
    await spelling.recheck();
    expect(hl.words()).toEqual(['النضام', 'ان']);
  });

  it('fixes only the case of a stray capital', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'oNly ');
    await spelling.settled();
    expect(el.textContent).toBe('only ');
  });

  it('leaves ambiguous, short and all-caps words as typed', async () => {
    const { el, replace, spelling } = setup();
    typeChars(el, 'afte tge GOSSI TEH ان ');
    await spelling.settled();
    expect(el.textContent).toBe('afte tge GOSSI TEH ان ');
    expect(replace).not.toHaveBeenCalled();
  });

  it('preserves capitalization and corrects each language in a mixed sentence', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'Seperate المستخذم paymnet ');
    await spelling.settled();
    expect(el.textContent).toBe('Separate المستخدم payment ');
  });

  it('keeps the caret where the agent is typing', async () => {
    const { el, svc, spelling } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate t'); // decision lands after the "t"
    release();
    await spelling.settled();
    expect(el.textContent).toBe('separate t');
    const sel = document.getSelection()!;
    expect(sel.anchorNode!.textContent!.slice(0, sel.anchorOffset)).toBe('separate t');
  });

  it('does not apply if the word changed before the decision arrived', async () => {
    const { el, svc, replace, spelling } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate ');
    (el.firstChild as Text).replaceData(0, 8, 'separete');
    release();
    await spelling.settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not insert anything once the composer was cleared (message sent)', async () => {
    const { el, svc, replace, spelling } = setup();
    const release = svc.holdChecks();
    typeChars(el, 'seperate ');
    el.replaceChildren();
    release();
    await spelling.settled();
    expect(replace).not.toHaveBeenCalled();
    expect(el.textContent).toBe('');
  });

  it('ignores paste and host insertions', async () => {
    const { el, replace, spelling } = setup();
    el.textContent = 'please seperate ';
    placeCaret(el.firstChild!, 16);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'please seperate ' }));
    await spelling.settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('never corrects custom dictionary words', async () => {
    const { el, replace, spelling } = setup({ customWords: ['seperate'] });
    typeChars(el, 'seperate ');
    await spelling.settled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('known misspellings', () => {
  it('fixes listed words whatever their length, keeping a leading capital', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'teh. Teh ');
    await spelling.settled();
    expect(el.textContent).toBe('the. The ');
  });

  it('fixes a listed Arabic hamza slip', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'اذا كان');
    await spelling.settled();
    expect(el.textContent).toBe('إذا كان');
  });

  it('at list-only confidence fixes only listed words', async () => {
    const { el, hl, spelling } = setup({ autoReplace: 'list' });
    typeChars(el, 'teh paymnet ');
    await spelling.settled();
    expect(el.textContent).toBe('the paymnet ');
    await spelling.recheck();
    expect(hl.words()).toEqual(['paymnet']);
  });

  it('sends no neighbors request for a listed word', async () => {
    const { el, svc, spelling } = setup();
    typeChars(el, 'teh paymnet ');
    await spelling.settled();
    expect(svc.neighborRequests).toEqual(['paymnet']);
  });

  it('does not fix a reverted listed word again', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'teh ');
    await spelling.settled();
    (el.firstChild as Text).replaceData(0, 3, 'teh');
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    typeChars(el, 'teh ');
    await spelling.settled();
    expect(el.textContent).toBe('teh teh ');
  });

  it.each([
    ['teh ', 'the', 'ltr'],
    ['الى ', 'إلى', 'rtl'],
  ])('offers the list fix first in suggest mode: %s', async (typed, first, dir) => {
    const { el, assistant, spelling } = setup({ mode: 'suggest' });
    typeChars(el, typed);
    await spelling.recheck();
    placeCaret(el.firstChild!, 1);
    const popover = await clickWord(el, assistant);
    expect(popover.suggestions[0]).toBe(first);
    expect(popover.suggestions.filter((t) => t === first)).toHaveLength(1);
    expect(popover.dir).toBe(dir);
  });
});

describe('names (Req 4.2.2)', () => {
  it.each(['Dear Ms. Fatimah, ', 'Dear Mr. Al-Harbi, '])('leaves a capitalized name in mid-sentence: %s', async (text) => {
    const { el, replace, spelling } = setup();
    typeChars(el, text);
    await spelling.settled();
    expect(el.textContent).toBe(text);
    expect(replace).not.toHaveBeenCalled();
  });

  it('still fixes a capitalized typo that starts a sentence', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'Thanks. Seperate forms ');
    await spelling.settled();
    expect(el.textContent).toBe('Thanks. Separate forms ');
  });

  it('leaves words the customer wrote, in English and Arabic', async () => {
    const conversation: Turn[] = [
      { role: 'customer', text: 'Hello, this is Noura' },
      { role: 'customer', text: 'معك نوره من الرياض' },
      { role: 'customer', text: 'my employer is Almarai' },
    ];
    const { el, replace, spelling } = setup({ conversation });
    typeChars(el, 'Noura, thank you. شكراً نوره، ');
    await spelling.settled();
    expect(el.textContent).toBe('Noura, thank you. شكراً نوره، ');
    typeChars(el, 'تم تحديث بيانات Almarai والنضام ');
    await spelling.settled();
    expect(el.textContent).toContain('Almarai');
    expect(replace).not.toHaveBeenCalled();
  });

  it('without a conversation, a name that starts a sentence follows the other rules', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'Noura, ');
    await spelling.settled();
    expect(el.textContent).toBe('Nora, ');
  });
});

describe('words completed by . @ : / (KI-2)', () => {
  const step = async (el: HTMLElement, spelling: { settled(): Promise<void> }, chars: string) => {
    typeChars(el, chars);
    await spelling.settled();
    return el.textContent;
  };

  it('holds a word before a full stop until the next space', async () => {
    const { el, spelling } = setup();
    expect(await step(el, spelling, 'please seperate.')).toBe('please seperate.');
    expect(await step(el, spelling, ' ')).toBe('please separate. ');
  });

  it('holds an Arabic word before a full stop', async () => {
    const { el, spelling } = setup();
    expect(await step(el, spelling, 'رقم المستخذم.')).toBe('رقم المستخذم.');
    expect(await step(el, spelling, ' ')).toBe('رقم المستخدم. ');
  });

  it('decides at once after a comma', async () => {
    const { el, spelling } = setup();
    expect(await step(el, spelling, 'please seperate,')).toBe('please separate,');
  });

  it.each(['email info@gosi.gov.sa ', 'visit https://www.gosi.gov.sa/en ', 'راسلنا على info@gosi.gov.sa '])(
    'never touches an address typed by hand: %s',
    async (text) => {
      const { el, replace, spelling } = setup();
      for (const ch of text) expect(await step(el, spelling, ch)).toBe(text.slice(0, el.textContent!.length));
      expect(el.textContent).toBe(text);
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it('decides a held word on a line break', async () => {
    const { el, spelling } = setup();
    typeChars(el, 'please seperate.');
    el.append(document.createElement('br'));
    placeCaret(el, el.childNodes.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertLineBreak' }));
    await spelling.settled();
    expect(el.textContent).toBe('please separate.');
    expect(el.querySelector('br')).not.toBeNull();
  });

  it('drops a held word when whitespace is typed elsewhere', async () => {
    const { el, replace, spelling } = setup();
    typeChars(el, 'please seperate.');
    (el.firstChild as Text).insertData(0, ' ');
    placeCaret(el.firstChild!, 1);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    await spelling.settled();
    expect(el.textContent).toBe(' please seperate.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('drops held words when the message is sent', async () => {
    const { el, replace, spelling } = setup();
    typeChars(el, 'please seperate.');
    el.replaceChildren(); // host clears the composer on Enter-to-send
    await spelling.recheck();
    typeChars(el, 'hello ');
    await spelling.settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('reverts a held word\'s replacement with one Undo', async () => {
    const { el, events, spelling } = setup();
    typeChars(el, 'please seperate. ');
    await spelling.settled();
    expect(el.textContent).toBe('please separate. ');
    (el.firstChild as Text).replaceData(7, 8, 'seperate');
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
  });
});

describe('reverting an auto-correction', () => {
  it('offers "Revert to original" in the popover, restores it once, and never corrects it again', async () => {
    const { el, events, replace, assistant, spelling } = setup();
    typeChars(el, 'المستخذم ');
    await spelling.settled();
    expect(el.textContent).toBe('المستخدم ');
    placeCaret(el.firstChild!, 2);
    const popover = await clickWord(el, assistant);
    expect(popover.dir).toBe('rtl');
    expect(popover.revertTo).toBe('المستخذم');
    expect(popover.suggestions).toEqual([]);
    replace.mockClear();
    assistant.revertCorrection();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('المستخذم ');
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
    // not corrected or underlined again
    typeChars(el, 'المستخذم ');
    await spelling.settled();
    await spelling.recheck();
    expect(el.textContent).toBe('المستخذم المستخذم ');
  });

  it('offers no Revert once the agent edited the corrected word', async () => {
    const { el, assistant, spelling } = setup();
    typeChars(el, 'seperate ');
    await spelling.settled();
    (el.firstChild as Text).replaceData(0, 8, 'separated');
    await spelling.recheck();
    placeCaret(el.firstChild!, 3);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(assistant.getState().popover?.revertTo).toBeUndefined();
  });

  it('treats an Undo that restores the original as a revert', async () => {
    const { el, events, spelling } = setup();
    typeChars(el, 'please seperate ');
    await spelling.settled();
    // what the browser does on Undo: put the original back, fire historyUndo
    (el.firstChild as Text).replaceData(7, 8, 'seperate');
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    expect(events.map((e) => e.type)).toEqual(['autocorrect', 'revert']);
    typeChars(el, 'seperate ');
    await spelling.settled();
    expect(el.textContent).toBe('please seperate seperate ');
  });

  it('emits accept and ignore from the suggestion popover', async () => {
    const { el, events, assistant, spelling } = setup();
    typeChars(el, 'afte ');
    await spelling.settled();
    await spelling.recheck();
    placeCaret(el.firstChild!, 2);
    await clickWord(el, assistant);
    assistant.ignoreWord();
    expect(events).toEqual([
      { type: 'flag', lang: 'en', original: 'afte' },
      { type: 'ignore', lang: 'en', original: 'afte' },
    ]);
  });

  it('emits accept when a suggestion is chosen', async () => {
    const { el, events, assistant, spelling } = setup();
    typeChars(el, 'afte ');
    await spelling.settled();
    await spelling.recheck();
    placeCaret(el.firstChild!, 2);
    await clickWord(el, assistant);
    assistant.pickSuggestion('after');
    expect(el.textContent).toBe('after ');
    expect(events).toEqual([
      { type: 'flag', lang: 'en', original: 'afte' },
      { type: 'accept', lang: 'en', original: 'afte', replacement: 'after', rank: 4, offered: 5 },
    ]);
  });
});
