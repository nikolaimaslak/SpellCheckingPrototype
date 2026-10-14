// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/assistant';
import type { Server } from '../../src/assistant/server';
import { fakeChecker, field, placeCaret, testAssistant } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => {
  assistants.splice(0).forEach((a) => a.detach());
});

const setup = (html: string, bad = { en: ['recieve', 'GOSSI'], ar: ['اذا'] }, ready?: ('en' | 'ar')[], server?: Server) => {
  const el = field(html);
  const svc = fakeChecker(bad, ready);
  const t = testAssistant(el, { checker: svc.checker, ...(server ? { server } : {}) });
  assistants.push(t.assistant);
  return { el, svc, ...t, spelling: t.assistant.spelling! };
};

describe('spelling', () => {
  it('flags only misspelled settled words', async () => {
    const { hl, spelling } = setup('I will recieve it ');
    await spelling.recheck();
    expect(hl.words()).toEqual(['recieve']);
  });

  it('checks Arabic and mixed sentences per language', async () => {
    const { hl, spelling } = setup('رقم الطلب في نظام GOSSI هو اذا ');
    await spelling.recheck();
    expect(hl.words().sort()).toEqual(['GOSSI', 'اذا'].sort());
  });

  it('does not flag the word being typed', async () => {
    const { el, hl, spelling } = setup('I will recieve');
    placeCaret(el.firstChild!, 14);
    await spelling.recheck();
    expect(hl.words()).toEqual([]);
  });

  it('keeps the underline when the caret moves into an unchanged flagged word', async () => {
    const { el, hl, spelling } = setup('I will recieve it');
    await spelling.recheck();
    expect(hl.words()).toEqual(['recieve']);
    placeCaret(el.firstChild!, 9); // inside "recieve"
    await spelling.recheck();
    expect(hl.words()).toEqual(['recieve']);
  });

  it('drops a stale reply when a newer check has started', async () => {
    const { el, hl, svc, spelling } = setup('recieve one ');
    const release = svc.holdChecks();
    const first = spelling.recheck();
    el.textContent = 'fine words ';
    const second = spelling.recheck();
    release();
    await Promise.all([first, second]);
    expect(hl.words()).toEqual([]);
  });

  it('suggest mode never changes text, even after a typed boundary', async () => {
    const { el, hl, replace, spelling } = setup('please seperate', { en: ['seperate'], ar: [] });
    const text = el.firstChild as Text;
    text.appendData(' ');
    placeCaret(text, text.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    await spelling.settled();
    await spelling.recheck();
    expect(el.textContent).toBe('please seperate ');
    expect(replace).not.toHaveBeenCalled();
    expect(hl.words()).toEqual(['seperate']);
  });

  it('respects the languages option', async () => {
    const el = field('recieve اذا ');
    const { checker } = fakeChecker({ en: ['recieve'], ar: ['اذا'] });
    const { assistant, hl } = testAssistant(el, { checker, languages: ['ar'] });
    assistants.push(assistant);
    await assistant.spelling!.recheck();
    expect(hl.words()).toEqual(['اذا']);
  });

  it('detach removes underlines and listeners', async () => {
    const { el, hl, svc, assistant, spelling } = setup('recieve ');
    await spelling.recheck();
    assistant.detach();
    expect(hl.registered.size).toBe(0);
    const checksBefore = svc.checked.length;
    el.textContent = 'recieve again ';
    el.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.checked.length).toBe(checksBefore);
  });

  it('rechecks after input on a debounce', async () => {
    const { el, hl } = setup('fine ');
    el.textContent = 'fine recieve ';
    el.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(hl.words()).toEqual(['recieve']));
  });

  it('turns native spellcheck off and restores the original attribute on detach', () => {
    const el = field('');
    el.setAttribute('spellcheck', 'true');
    const { assistant } = testAssistant(el);
    expect(el.getAttribute('spellcheck')).toBe('false');
    assistant.detach();
    expect(el.getAttribute('spellcheck')).toBe('true');

    const bare = field('');
    const second = testAssistant(bare).assistant;
    expect(bare.getAttribute('spellcheck')).toBe('false');
    second.detach();
    expect(bare.hasAttribute('spellcheck')).toBe(false);
  });

  it('starts underlining once a language becomes ready', async () => {
    const { hl, svc } = setup('I will recieve it ', undefined, []);
    await new Promise((r) => setTimeout(r, 10));
    expect(hl.words()).toEqual([]);
    svc.makeReady('en');
    await vi.waitFor(() => expect(hl.words()).toEqual(['recieve']));
  });
});

describe('suggestions and acceptance', () => {
  const click = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

  it('opens on click inside a flagged word and accepting replaces exactly that word', async () => {
    const { el, replace, assistant, spelling } = setup('I will recieve it ');
    await spelling.recheck();
    placeCaret(el.firstChild!, 9);
    click(el);
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    expect(assistant.getState().popover!.dir).toBe('ltr');
    expect(assistant.getState().popover!.suggestions).toEqual(['receive', 'relieve']);
    assistant.pickSuggestion('receive');
    expect(assistant.getState().popover).toBeUndefined();
    expect(replace).toHaveBeenCalledTimes(1);
    const [range, text] = replace.mock.calls[0];
    expect(range.toString()).toBe('recieve');
    expect(text).toBe('receive');
  });

  it('opens with the keyboard shortcut, RTL for Arabic', async () => {
    const { el, assistant, spelling } = setup('اذا كان ');
    await spelling.recheck();
    placeCaret(el.firstChild!, 1);
    const e = new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    expect(assistant.getState().popover!.dir).toBe('rtl');
  });

  it('does not open while the polish preview is open', async () => {
    const server: Server = {
      complete: async () => null,
      polish: async () => ({ polished: 'I will receive it ', changed: true }),
    };
    const { el, assistant, spelling } = setup('I will recieve it ', undefined, undefined, server);
    await spelling.recheck();
    await assistant.polishNow();
    expect(assistant.getState().polish.preview).toBeDefined();
    placeCaret(el.firstChild!, 9);
    click(el);
    await new Promise((r) => setTimeout(r, 10));
    expect(assistant.getState().popover).toBeUndefined();
  });

  it('does nothing on click outside flagged words', async () => {
    const { el, assistant, spelling } = setup('I will recieve it ');
    await spelling.recheck();
    placeCaret(el.firstChild!, 2);
    click(el);
    await new Promise((r) => setTimeout(r, 10));
    expect(assistant.getState().popover).toBeUndefined();
  });

  it('aborts acceptance if the word changed since the popover opened', async () => {
    const { el, replace, assistant, spelling } = setup('I will recieve it ');
    await spelling.recheck();
    placeCaret(el.firstChild!, 9);
    click(el);
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    (el.firstChild as Text).replaceData(7, 7, 'recievd'); // agent edits the word meanwhile
    assistant.pickSuggestion('receive');
    expect(replace).not.toHaveBeenCalled();
  });

  it('Ignore unflags every occurrence without changing text', async () => {
    const { el, hl, replace, assistant, spelling } = setup('recieve and recieve ');
    await spelling.recheck();
    expect(hl.words()).toEqual(['recieve', 'recieve']);
    placeCaret(el.firstChild!, 2);
    click(el);
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    assistant.ignoreWord();
    await vi.waitFor(() => expect(hl.words()).toEqual([]));
    expect(el.textContent).toBe('recieve and recieve ');
    expect(replace).not.toHaveBeenCalled();
    el.textContent += 'recieve ';
    await spelling.recheck();
    expect(hl.words()).toEqual([]);
  });

  it('caps the suggestions at five', async () => {
    const { el, assistant, spelling } = setup('please afte it ', { en: ['afte'], ar: [] });
    await spelling.recheck();
    placeCaret(el.firstChild!, 9);
    click(el);
    await vi.waitFor(() => expect(assistant.getState().popover).toBeDefined());
    expect(assistant.getState().popover!.suggestions).toHaveLength(5);
  });
});
