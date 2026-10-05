import { describe, expect, it } from 'vitest';
import { detectMac, ghostKeyAction, nextWord, type KeyLike } from '../../src/completion/keys';

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe('ghostKeyAction', () => {
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
