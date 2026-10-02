// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountChat, setChatFidelity } from '../../src/demo/chat';

let composer: HTMLElement;
let transcript: HTMLElement;

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
  composer.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.innerHTML = '<ol id="t"></ol><div id="c" contenteditable="true"></div>';
  composer = document.getElementById('c')!;
  transcript = document.getElementById('t')!;
  mountChat(composer, transcript);
});

describe('chat composer', () => {
  it('Enter sends plain text and empties the composer', () => {
    composer.innerHTML = 'Hello, <b>how</b> can I help?';
    expect(press({}).defaultPrevented).toBe(true);
    const items = [...transcript.children];
    expect(items.map((li) => li.textContent)).toEqual(['Hello, how can I help?']);
    expect(items[0].children).toHaveLength(0); // plain text, no markup
    expect(composer.childNodes).toHaveLength(0);
  });

  it('sends Arabic text with automatic direction', () => {
    composer.textContent = 'مرحبا، كيف يمكنني مساعدتك؟';
    press({});
    const item = transcript.querySelector('li')!;
    expect(item.textContent).toBe('مرحبا، كيف يمكنني مساعدتك؟');
    expect(item.dir).toBe('auto');
  });

  it('Shift+Enter does not send', () => {
    composer.textContent = 'first line';
    expect(press({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(transcript.children).toHaveLength(0);
    expect(composer.textContent).toBe('first line');
  });

  it('ignores Enter on an empty composer', () => {
    composer.textContent = '   ';
    press({});
    expect(transcript.children).toHaveLength(0);
  });

  it('does not send when another handler (the suggestion popover) consumed Enter', () => {
    composer.textContent = 'recieve';
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    event.preventDefault();
    composer.dispatchEvent(event);
    expect(transcript.children).toHaveLength(0);
  });

  it('fidelity mode fixes the base direction like Agent Desktop', () => {
    composer.dir = 'auto';
    setChatFidelity(composer, true);
    expect(composer.hasAttribute('dir')).toBe(false);
    expect(composer.classList.contains('fidelity')).toBe(true);
    setChatFidelity(composer, false);
    expect(composer.dir).toBe('auto');
  });
});
