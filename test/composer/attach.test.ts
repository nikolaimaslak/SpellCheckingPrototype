// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachSpellCheck } from '../../src/composer';
import { composer, fakeHighlightEnv, fakeService, placeCaret } from './fakes';

const handles: { detach(): void }[] = [];
afterEach(() => {
  handles.splice(0).forEach((h) => h.detach());
  document.head.replaceChildren();
});

const setup = (html: string, bad = { en: ['recieve', 'GOSSI'], ar: ['اذا'] }, ready?: ('en' | 'ar')[]) => {
  const el = composer(html);
  const hl = fakeHighlightEnv();
  const svc = fakeService(bad, ready);
  const replace = vi.fn();
  const handle = attachSpellCheck(el, {
    service: svc.service,
    debounceMs: 1,
    env: { highlights: hl.env, replace, rectOf: () => new DOMRect(10, 10, 40, 16) },
  });
  handles.push(handle);
  return { el, hl, svc, replace, handle };
};

describe('attachSpellCheck', () => {
  it('flags only misspelled settled words', async () => {
    const { hl, handle } = setup('I will recieve it ');
    await handle.recheck();
    expect(hl.words()).toEqual(['recieve']);
  });

  it('checks Arabic and mixed sentences per language', async () => {
    const { hl, handle } = setup('رقم الطلب في نظام GOSSI هو اذا ');
    await handle.recheck();
    expect(hl.words().sort()).toEqual(['GOSSI', 'اذا'].sort());
  });

  it('does not flag the word being typed', async () => {
    const { el, hl, handle } = setup('I will recieve');
    placeCaret(el.firstChild!, 14);
    await handle.recheck();
    expect(hl.words()).toEqual([]);
  });

  it('keeps the underline when the caret moves into an unchanged flagged word', async () => {
    const { el, hl, handle } = setup('I will recieve it');
    await handle.recheck();
    expect(hl.words()).toEqual(['recieve']);
    placeCaret(el.firstChild!, 9); // inside "recieve"
    await handle.recheck();
    expect(hl.words()).toEqual(['recieve']);
  });

  it('drops a stale reply when a newer check has started', async () => {
    const { el, hl, svc, handle } = setup('recieve one ');
    const release = svc.holdChecks();
    const first = handle.recheck();
    el.textContent = 'fine words ';
    const second = handle.recheck();
    release();
    await Promise.all([first, second]);
    expect(hl.words()).toEqual([]);
  });

  it('suggest mode never changes text, even after a typed boundary', async () => {
    const { el, hl, replace, handle } = setup('please seperate', { en: ['seperate'], ar: [] });
    const text = el.firstChild as Text;
    text.appendData(' ');
    placeCaret(text, text.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    await handle.settled();
    await handle.recheck();
    expect(el.textContent).toBe('please seperate ');
    expect(replace).not.toHaveBeenCalled();
    expect(hl.words()).toEqual(['seperate']);
  });

  it('respects the languages option', async () => {
    const el = composer('recieve اذا ');
    const hl = fakeHighlightEnv();
    const { service } = fakeService({ en: ['recieve'], ar: ['اذا'] });
    const handle = attachSpellCheck(el, { service, languages: ['ar'], env: { highlights: hl.env } });
    await handle.recheck();
    expect(hl.words()).toEqual(['اذا']);
    handle.detach();
  });

  it('detach removes underlines, style and listeners', async () => {
    const { el, hl, svc, handle } = setup('recieve ');
    await handle.recheck();
    handle.detach();
    expect(hl.registered.size).toBe(0);
    expect(document.querySelector('style[data-bp-spell]')).toBeNull();
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

  describe('native spellcheck handover', () => {
    it('sets spellcheck=false once a language is ready and restores an absent attribute', () => {
      const { el, handle } = setup('', undefined, ['en']);
      expect(el.getAttribute('spellcheck')).toBe('false');
      handle.detach();
      expect(el.hasAttribute('spellcheck')).toBe(false);
    });

    it('restores an original spellcheck="true"', () => {
      const el = composer('');
      el.setAttribute('spellcheck', 'true');
      const { service } = fakeService({}, ['en']);
      const handle = attachSpellCheck(el, { service, env: { highlights: fakeHighlightEnv().env } });
      expect(el.getAttribute('spellcheck')).toBe('false');
      handle.detach();
      expect(el.getAttribute('spellcheck')).toBe('true');
    });

    it('waits for readiness and leaves native spellcheck if nothing loads', () => {
      const el = composer('');
      const svc = fakeService({}, []);
      const handle = attachSpellCheck(el, { service: svc.service, env: { highlights: fakeHighlightEnv().env } });
      expect(el.hasAttribute('spellcheck')).toBe(false);
      svc.makeReady('en');
      expect(el.getAttribute('spellcheck')).toBe('false');
      handle.detach();
    });
  });
});

describe('suggestions and acceptance', () => {
  const popover = () => document.querySelector<HTMLElement>('[data-bp-spell-popover]');
  const option = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')].find((o) => o.textContent === label)!;

  it('opens on click inside a flagged word and accepting replaces exactly that word', async () => {
    const { el, replace, handle } = setup('I will recieve it ');
    await handle.recheck();
    placeCaret(el.firstChild!, 9);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    expect(popover()!.dir).toBe('ltr');
    option('receive').click();
    expect(replace).toHaveBeenCalledTimes(1);
    const [range, text] = replace.mock.calls[0];
    expect(range.toString()).toBe('recieve');
    expect(text).toBe('receive');
  });

  it('opens with the keyboard shortcut, RTL for Arabic', async () => {
    const { el, handle } = setup('اذا كان ');
    await handle.recheck();
    placeCaret(el.firstChild!, 1);
    const e = new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    expect(popover()!.dir).toBe('rtl');
  });

  it('does nothing on click outside flagged words', async () => {
    const { el, handle } = setup('I will recieve it ');
    await handle.recheck();
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(popover()).toBeNull();
  });

  it('aborts acceptance if the word changed since the popover opened', async () => {
    const { el, replace, handle } = setup('I will recieve it ');
    await handle.recheck();
    placeCaret(el.firstChild!, 9);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    (el.firstChild as Text).replaceData(7, 7, 'recievd'); // agent edits the word meanwhile
    option('receive').click();
    expect(replace).not.toHaveBeenCalled();
  });

  it('Ignore unflags every occurrence without changing text', async () => {
    const { el, hl, replace, handle } = setup('recieve and recieve ');
    await handle.recheck();
    expect(hl.words()).toEqual(['recieve', 'recieve']);
    placeCaret(el.firstChild!, 2);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(popover()).not.toBeNull());
    option('Ignore').click();
    await vi.waitFor(() => expect(hl.words()).toEqual([]));
    expect(el.textContent).toBe('recieve and recieve ');
    expect(replace).not.toHaveBeenCalled();
    el.textContent += 'recieve ';
    await handle.recheck();
    expect(hl.words()).toEqual([]);
  });
});
