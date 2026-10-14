// @vitest-environment jsdom
// Spelling events in the log: a flag once per word per message, autocorrect, accept with rank.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant, AssistEvent } from '../../src/assistant';
import { fakeChecker, field, placeCaret, testAssistant, textReplace, typeChars } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => assistants.splice(0).forEach((a) => a.detach()));

const BAD = { en: ['chek', 'chekk', 'recieve', 'seperate', 'afte'], ar: ['النضام', 'الطلبب'] };

function setup(html: string, mode: 'suggest' | 'auto' = 'suggest') {
  const el = field(html);
  const { assistant, events } = testAssistant(el, { checker: fakeChecker(BAD).checker, spelling: mode, env: { replace: textReplace(el) } });
  assistants.push(assistant);
  const of = (type: AssistEvent['type']) => events.filter((e) => e.type === type).map(({ type: _t, ...rest }) => rest);
  return { el, events, assistant, spelling: assistant.spelling!, of, text: () => el.firstChild as Text };
}

describe('flag events', () => {
  it('reports an English flag once per message, across rechecks and edits elsewhere', async () => {
    const { spelling, of, text } = setup('please chek the form ');
    await spelling.recheck();
    await spelling.recheck();
    text().appendData('today ');
    await spelling.recheck();
    expect(of('flag')).toEqual([{ lang: 'en', original: 'chek' }]);
  });

  it('reports an Arabic flag in suggest mode', async () => {
    const { spelling, of } = setup('تم تحديث النضام اليوم ');
    await spelling.recheck();
    expect(of('flag')).toEqual([{ lang: 'ar', original: 'النضام' }]);
  });

  it('reports one flag per word in a mixed message', async () => {
    const { spelling, of } = setup('please chek الطلبب now ');
    await spelling.recheck();
    expect(of('flag')).toEqual([
      { lang: 'en', original: 'chek' },
      { lang: 'ar', original: 'الطلبب' },
    ]);
  });

  it('reports the same word again in the next message', async () => {
    const { el, spelling, of } = setup('please chek it ');
    await spelling.recheck();
    el.textContent = ''; // sent
    await spelling.recheck();
    el.textContent = 'chek again ';
    await spelling.recheck();
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

describe('accept events', () => {
  it('reports a popover pick as accept with rank and offered', async () => {
    const { el, assistant, spelling, of } = setup('I will recieve it ');
    await spelling.recheck();
    placeCaret(el.firstChild!, 9);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(assistant.getState().popover?.suggestions).toContain('relieve'));
    assistant.pickSuggestion('relieve');
    await spelling.recheck();
    expect(of('accept')).toEqual([{ lang: 'en', original: 'recieve', replacement: 'relieve', rank: 2, offered: 2 }]);
  });

  it('records the position and count of the suggestions shown', async () => {
    const { el, assistant, spelling, of } = setup('ask afte lunch ');
    await spelling.recheck();
    placeCaret(el.firstChild!, 5);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(assistant.getState().popover?.suggestions.length).toBeGreaterThan(1));
    const shown = assistant.getState().popover!.suggestions;
    assistant.pickSuggestion(shown[1]);
    expect(of('accept')).toEqual([{ lang: 'en', original: 'afte', replacement: shown[1], rank: 2, offered: shown.length }]);
  });
});
