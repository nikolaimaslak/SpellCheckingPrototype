import { describe, expect, it } from 'vitest';
import {
  currentSentence,
  detectMac,
  ghostKeyAction,
  ghostLayout,
  nextWord,
  shouldRequest,
  type FieldStyle,
  type KeyLike,
  type TriggerState,
} from '../../src/assistant/completion-rules';
import type { Rect } from '../../src/assistant/state';

describe('shouldRequest', () => {
  const base: TriggerState = { before: '', after: '', composing: false, overlayOpen: false };
  const go = (over: Partial<TriggerState>) => shouldRequest({ ...base, ...over });

  it('needs at least 3 words in the current sentence', () => {
    expect(go({ before: 'Thank you' })).toBe(false);
    expect(go({ before: 'Thank you for' })).toBe(true);
    expect(go({ before: 'Thank you for contacting us, your request' })).toBe(true);
  });

  it('counts words since the last sentence terminator, including ؟ and newlines', () => {
    expect(go({ before: 'Hello there my friend. Your request' })).toBe(false);
    expect(go({ before: 'هل تريد المساعدة؟ تم استلام' })).toBe(false);
    expect(go({ before: 'هل تريد المساعدة؟ تم استلام طلبك' })).toBe(true);
    expect(go({ before: 'one two three\nfour' })).toBe(false);
  });

  it('requires the caret at the end of its line', () => {
    expect(go({ before: 'Thank you for', after: ' contacting' })).toBe(false);
    expect(go({ before: 'Thank you for', after: '  ' })).toBe(true);
  });

  it('is suppressed while composing or with an overlay open', () => {
    const ok = { before: 'Thank you for contacting' };
    expect(go({ ...ok, composing: true })).toBe(false);
    expect(go({ ...ok, overlayOpen: true })).toBe(false);
  });

  it('extracts the current sentence', () => {
    expect(currentSentence('One. Two three')).toBe(' Two three');
  });
});

describe('ghostKeyAction', () => {
  const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

  it('accepts all with Tab or the forward arrow of the suggestion direction', () => {
    expect(ghostKeyAction(k('Tab'), 'ltr', false)).toBe('accept-all');
    expect(ghostKeyAction(k('ArrowRight'), 'ltr', false)).toBe('accept-all');
    expect(ghostKeyAction(k('ArrowLeft'), 'rtl', false)).toBe('accept-all');
  });

  it('accepts a word with Ctrl + forward arrow, or Option + forward arrow on macOS', () => {
    expect(ghostKeyAction(k('ArrowRight', { ctrlKey: true }), 'ltr', false)).toBe('accept-word');
    expect(ghostKeyAction(k('ArrowLeft', { ctrlKey: true }), 'rtl', false)).toBe('accept-word');
    expect(ghostKeyAction(k('ArrowRight', { altKey: true }), 'ltr', true)).toBe('accept-word');
    expect(ghostKeyAction(k('ArrowRight', { ctrlKey: true }), 'ltr', true)).toBe('dismiss');
    expect(ghostKeyAction(k('ArrowRight', { altKey: true }), 'ltr', false)).toBe('dismiss');
    expect(ghostKeyAction(k('ArrowLeft', { altKey: true }), 'rtl', false)).toBe('dismiss'); // Alt+Left is Back on Windows
  });

  it('dismisses on the backward arrow, Shift+arrow and other navigation', () => {
    expect(ghostKeyAction(k('ArrowLeft'), 'ltr', false)).toBe('dismiss');
    expect(ghostKeyAction(k('ArrowRight'), 'rtl', false)).toBe('dismiss');
    expect(ghostKeyAction(k('ArrowRight', { shiftKey: true }), 'ltr', false)).toBe('dismiss');
    expect(ghostKeyAction(k('ArrowRight', { ctrlKey: true, shiftKey: true }), 'ltr', false)).toBe('dismiss');
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter']) expect(ghostKeyAction(k(key), 'ltr', false), key).toBe('dismiss');
  });

  it('reports Escape, and leaves other keys alone', () => {
    expect(ghostKeyAction(k('Escape'), 'ltr', false)).toBe('escape');
    expect(ghostKeyAction(k('a'), 'ltr', false)).toBe('none');
    expect(ghostKeyAction(k('Tab', { shiftKey: true }), 'ltr', false)).toBe('none');
  });
});

describe('nextWord', () => {
  it('takes leading whitespace and the next run of non-whitespace', () => {
    expect(nextWord(' will be processed')).toBe(' will');
    expect(nextWord(' وسيتم الرد')).toBe(' وسيتم');
    expect(nextWord(' days.')).toBe(' days.');
    expect(nextWord('ll be')).toBe('ll');
    expect(nextWord('  ')).toBe('  ');
  });
});

describe('detectMac', () => {
  it('reads the platform', () => {
    expect(detectMac({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(detectMac({ platform: 'Win32', userAgent: '' })).toBe(false);
    expect(detectMac(undefined)).toBe(false);
  });
});

describe('ghostLayout', () => {
  const content: Rect = { left: 100, right: 500, top: 50, bottom: 110 };
  const style = (direction: string): FieldStyle => ({ font: '16px serif', lineHeight: '20px', letterSpacing: 'normal', direction });
  const caret = (left: number, right: number, top: number, bottom: number): Rect => ({ left, right, top, bottom });

  it('starts the first line at the caret for LTR text', () => {
    expect(ghostLayout(caret(230, 240, 60, 80), content, style('ltr'), 'ltr')).toEqual({
      top: 60,
      left: 100,
      width: 400,
      textIndent: 140, // caret.right − content.left
      textAlign: 'start',
      direction: 'ltr',
      font: '16px serif',
      lineHeight: '20px',
      letterSpacing: 'normal',
    });
  });

  it('continues leftwards from the caret on the same line for Arabic in an RTL field', () => {
    const l = ghostLayout(caret(300, 310, 60, 80), content, style('rtl'), 'rtl')!;
    expect(l.direction).toBe('rtl');
    expect(l.top).toBe(60);
    expect(l.textIndent).toBe(200); // content.right − caret.left
  });

  it('puts Arabic ghost text on the line below, left-aligned, in a fixed-LTR field', () => {
    const l = ghostLayout(caret(110, 118, 60, 80), content, style('ltr'), 'rtl')!;
    expect(l.direction).toBe('rtl');
    expect(l.textAlign).toBe('left');
    expect(l.top).toBe(80); // caret line bottom
    expect(l.left).toBe(100);
    expect(l.textIndent).toBe(0);
  });

  it('is null when the caret line is scrolled out or the caret is unknown', () => {
    expect(ghostLayout(caret(230, 240, 200, 220), content, style('ltr'), 'ltr')).toBeNull();
    expect(ghostLayout(null, content, style('ltr'), 'ltr')).toBeNull();
  });
});
