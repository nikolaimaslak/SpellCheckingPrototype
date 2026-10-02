// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountChat } from '../../src/demo/chat';

let composer: HTMLElement;
let transcript: HTMLElement;

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
  composer.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.innerHTML = '<ol id="t"></ol><div id="c" contenteditable="plaintext-only"></div>';
  composer = document.getElementById('c')!;
  transcript = document.getElementById('t')!;
  mountChat(composer, transcript);
});

describe('chat composer', () => {
  it('Enter sends the message and empties the composer', () => {
    composer.textContent = 'Hello, how can I help?';
    expect(press({}).defaultPrevented).toBe(true);
    expect([...transcript.children].map((li) => li.textContent)).toEqual(['Hello, how can I help?']);
    expect(composer.textContent).toBe('');
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
});
