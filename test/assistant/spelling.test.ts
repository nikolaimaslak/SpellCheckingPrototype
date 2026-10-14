// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/assistant';
import type { Mistake, Server } from '../../src/assistant/server';
import { field, placeCaret, testAssistant, textReplace } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => {
  assistants.splice(0).forEach((a) => a.detach());
  document.body.replaceChildren();
});

const PAYMNET: Mistake = { word: 'paymnet', fixes: ['payment'], sure: true };
const AFTE: Mistake = { word: 'afte', fixes: ['after', 'aft'], sure: false };

/** A field with `text`, the caret at its end, and an assistant whose model answers `mistakes`. */
function setup(text: string, mistakes: Mistake[], options: Parameters<typeof testAssistant>[1] = {}) {
  const el = field(text);
  el.focus();
  placeCaret(el.firstChild!, text.length);
  const check = vi.fn<Server['check']>(async () => ({ mistakes, completion: '' }));
  const t = testAssistant(el, { server: { check, polish: async () => null }, env: { replace: textReplace(el) }, ...options });
  assistants.push(t.assistant);
  return { el, check, ...t };
}

const key = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

describe('spelling from the model', () => {
  it('sends the draft and custom words, and underlines the finished misspelled words', async () => {
    const { check, assistant, hl, events } = setup('the paymnet is afte', [PAYMNET, AFTE], { customWords: ['GOSI'] });
    await assistant.checkNow();
    expect(check.mock.calls[0][0]).toMatchObject({ text: 'the paymnet is afte', customWords: ['GOSI'] });
    // "afte" is still being typed (the caret is at its end).
    expect(hl.words()).toEqual(['paymnet']);
    expect(events.filter((e) => e.type === 'flag')).toEqual([{ type: 'flag', lang: 'en', original: 'paymnet' }]);
  });

  it('never underlines a custom word, even if the model reports it', async () => {
    const { assistant, hl } = setup('GOSI rules ', [{ word: 'GOSI', fixes: ['GOSH'], sure: true }], { customWords: ['GOSI'], spelling: 'auto' });
    await assistant.checkNow();
    expect(hl.words()).toEqual([]);
  });

  it('auto mode replaces the sure mistakes only, as one undoable edit each', async () => {
    const { el, assistant, hl, events } = setup('the paymnet is afte now', [PAYMNET, AFTE], { spelling: 'auto' });
    await assistant.checkNow();
    expect(el.textContent).toBe('the payment is afte now');
    expect(hl.words()).toEqual(['afte']);
    expect(events).toContainEqual({ type: 'autocorrect', lang: 'en', original: 'paymnet', replacement: 'payment' });
  });

  it('never auto-corrects the word at the caret or a word the customer wrote', async () => {
    const noura: Mistake = { word: 'Nura', fixes: ['Nora'], sure: true };
    const { el, assistant } = setup('Nura, the paymnet', [noura, PAYMNET], {
      spelling: 'auto',
      conversation: () => [{ role: 'customer', text: 'Hello, this is Nura.' }],
    });
    await assistant.checkNow();
    expect(el.textContent).toBe('Nura, the paymnet');
  });

  it('an Undo that brings the word back counts as a revert, and it is never corrected again', async () => {
    const { el, assistant, events } = setup('the paymnet is ', [PAYMNET], { spelling: 'auto' });
    await assistant.checkNow();
    expect(el.textContent).toBe('the payment is ');
    (el.firstChild as Text).data = 'the paymnet is ';
    el.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo' }));
    expect(events).toContainEqual({ type: 'revert', lang: 'en', original: 'paymnet', replacement: 'payment' });
    await assistant.checkNow();
    expect(el.textContent).toBe('the paymnet is ');
  });

  it('Ctrl+. opens the fixes; pick replaces the word, Ignore drops the underline', async () => {
    const { el, assistant, hl, events } = setup('please afte that', [AFTE]);
    await assistant.checkNow();
    placeCaret(el.firstChild!, 9); // inside "afte"
    key(el, { key: '.', ctrlKey: true });
    expect(assistant.getState().popover?.suggestions).toEqual(['after', 'aft']);
    assistant.spelling!.ignore();
    expect(hl.words()).toEqual([]);
    expect(events).toContainEqual({ type: 'ignore', lang: 'en', original: 'afte' });

    const second = setup('please afte that', [AFTE]);
    await second.assistant.checkNow();
    placeCaret(second.el.firstChild!, 9);
    key(second.el, { key: '.', ctrlKey: true });
    second.assistant.spelling!.pick('after');
    expect(second.el.textContent).toBe('please after that');
  });

  it('underlines Arabic mistakes too', async () => {
    const { assistant, hl } = setup('تم استلام هذه الطلب', [{ word: 'هذه', fixes: ['هذا'], sure: false }]);
    await assistant.checkNow();
    expect(hl.words()).toEqual(['هذه']);
  });
});
