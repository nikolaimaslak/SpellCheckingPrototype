// @vitest-environment jsdom
// Spelling telemetry from the layer: flags once per word per message, words left misspelled, accept rank.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachSpellCheck, type AssistEvent } from '../../src/composer';
import { composer, fakeHighlightEnv, fakeService, placeCaret, textReplace, typeChars } from './fakes';

const handles: { detach(): void }[] = [];
afterEach(() => handles.splice(0).forEach((h) => h.detach()));

const BAD = { en: ['chek', 'chekk', 'recieve', 'seperate', 'afte'], ar: ['النضام', 'الطلبب'] };

function setup(html: string, mode: 'suggest' | 'auto' = 'suggest') {
  const el = composer(html);
  const events: AssistEvent[] = [];
  const handle = attachSpellCheck(el, {
    service: fakeService(BAD).service,
    mode,
    debounceMs: 1,
    onEvent: (e) => events.push(e),
    env: { highlights: fakeHighlightEnv().env, replace: textReplace(el), rectOf: () => new DOMRect(10, 10, 40, 16) },
  });
  handles.push(handle);
  const of = (type: AssistEvent['type']) => events.filter((e) => e.type === type).map(({ type: _t, ...rest }) => rest);
  return { el, events, handle, of, text: () => el.firstChild as Text };
}

describe('flag events', () => {
  it('reports an English flag once per message, across rechecks and edits elsewhere', async () => {
    const { handle, of, text } = setup('please chek the form ');
    await handle.recheck();
    await handle.recheck();
    text().appendData('today ');
    await handle.recheck();
    expect(of('flag')).toEqual([{ lang: 'en', original: 'chek' }]);
  });

  it('reports an Arabic flag in suggest mode', async () => {
    const { handle, of } = setup('تم تحديث النضام اليوم ');
    await handle.recheck();
    expect(of('flag')).toEqual([{ lang: 'ar', original: 'النضام' }]);
  });

  it('reports one flag per word in a mixed message', async () => {
    const { handle, of } = setup('please chek الطلبب now ');
    await handle.recheck();
    expect(of('flag')).toEqual([
      { lang: 'en', original: 'chek' },
      { lang: 'ar', original: 'الطلبب' },
    ]);
  });

  it('reports the same word again in the next message', async () => {
    const { el, handle, of } = setup('please chek it ');
    await handle.recheck();
    el.textContent = ''; // sent
    await handle.recheck();
    el.textContent = 'chek again ';
    await handle.recheck();
    expect(of('flag')).toEqual([
      { lang: 'en', original: 'chek' },
      { lang: 'en', original: 'chek' },
    ]);
  });

  it('reports an auto-replaced word as autocorrect only', async () => {
    const { el, of } = setup('', 'auto');
    typeChars(el, 'I will seperate ');
    await vi.waitFor(() => expect(of('autocorrect')).toEqual([{ lang: 'en', original: 'seperate', replacement: 'separate' }]));
    expect(of('flag')).toEqual([]);
  });
});

describe('words left misspelled', () => {
  const send = async (el: HTMLElement, handle: { recheck(): Promise<void> }) => {
    el.textContent = ''; // sent or cleared
    await handle.recheck();
  };

  it('reports an English word still underlined when the message is sent, once', async () => {
    const { el, handle, of } = setup('please chek the chek form ');
    await handle.recheck();
    await send(el, handle);
    expect(of('unresolved')).toEqual([{ lang: 'en', original: 'chek' }]);
  });

  it('reports an Arabic word left misspelled', async () => {
    const { el, handle, of } = setup('تم تحديث النضام اليوم ');
    await handle.recheck();
    await send(el, handle);
    expect(of('unresolved')).toEqual([{ lang: 'ar', original: 'النضام' }]);
  });

  it('reports a mixed message per word and language', async () => {
    const { el, handle, of } = setup('please chek الطلبب now ');
    await handle.recheck();
    await send(el, handle);
    expect(of('unresolved')).toEqual([
      { lang: 'en', original: 'chek' },
      { lang: 'ar', original: 'الطلبب' },
    ]);
  });

  it('does not report words retyped correctly before the send', async () => {
    const { el, handle, of, text } = setup('please chek the form ');
    await handle.recheck();
    text().insertData('please che'.length, 'c'); // chek → check
    placeCaret(text(), text().length);
    await handle.recheck();
    await send(el, handle);
    expect(of('unresolved')).toEqual([]);
  });

  it('does not report ignored or popover-fixed words, and nothing for an empty start', async () => {
    const { el, handle, of } = setup('I will recieve it and chek it ');
    await handle.recheck();
    const open = async (offset: number) => {
      placeCaret(el.firstChild!, offset);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.waitFor(() => expect(document.querySelector('[data-bp-spell-popover]')).not.toBeNull());
      return [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')];
    };
    (await open(9)).find((o) => o.textContent === 'receive')!.click(); // fixed from the popover
    await handle.recheck();
    (await open('I will receive it and ch'.length)).find((o) => o.textContent === 'Ignore')!.click(); // ignored
    await handle.recheck();
    await send(el, handle);
    expect(of('unresolved')).toEqual([]);
    await handle.recheck(); // still empty: nothing more
    expect(of('unresolved')).toEqual([]);
  });

  it('reports a popover pick as accept with rank and offered', async () => {
    const { el, handle, of } = setup('I will recieve it ');
    await handle.recheck();
    placeCaret(el.firstChild!, 9);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const option = () =>
      [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')].find((o) => o.textContent === 'relieve');
    await vi.waitFor(() => expect(option()).toBeTruthy());
    option()!.click();
    await handle.recheck();
    expect(of('accept')).toEqual([{ lang: 'en', original: 'recieve', replacement: 'relieve', rank: 2, offered: 2 }]);
  });

  it('records the position and count of the suggestions shown', async () => {
    const { el, handle, of } = setup('ask afte lunch ');
    await handle.recheck();
    placeCaret(el.firstChild!, 5);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const options = () => [...document.querySelectorAll<HTMLElement>('[data-bp-spell-popover] [role=option]')];
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(1));
    const shown = options().map((o) => o.textContent).filter((t) => t !== 'Ignore'); // suggestions only
    options()[1].click();
    expect(of('accept')).toEqual([{ lang: 'en', original: 'afte', replacement: shown[1], rank: 2, offered: shown.length }]);
  });
});
