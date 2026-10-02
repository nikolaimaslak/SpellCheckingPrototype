// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createGhost, type GhostMeasure } from '../../src/completion/ghost';

let el: HTMLElement;
const content = { left: 100, right: 500, top: 50, bottom: 110 };
const measureAt = (caret: { left: number; right: number; top: number; bottom: number } | null): GhostMeasure => ({
  caretRect: () => (caret ? new DOMRect(caret.left, caret.top, caret.right - caret.left, caret.bottom - caret.top) : null),
  contentBox: () => content,
});
const node = () => document.querySelector<HTMLElement>('[data-bp-ghost]')!;

beforeEach(() => {
  document.body.innerHTML = '<div id="c" contenteditable="true" style="direction: ltr">text</div>';
  el = document.getElementById('c')!;
});

describe('ghost overlay', () => {
  it('starts the first line at the caret for LTR text', () => {
    const g = createGhost(el, measureAt({ left: 230, right: 240, top: 60, bottom: 80 }));
    g.show(' will be processed.', 'ltr');
    const s = node().style;
    expect(s.display).toBe('block');
    expect(s.direction).toBe('ltr');
    expect(s.left).toBe('100px');
    expect(s.width).toBe('400px');
    expect(s.top).toBe('60px');
    expect(s.textIndent).toBe('140px'); // caret.right − content.left
  });

  it('continues leftwards from the caret on the same line for Arabic in an RTL composer', () => {
    el.style.direction = 'rtl';
    const g = createGhost(el, measureAt({ left: 300, right: 310, top: 60, bottom: 80 }));
    g.show(' وسيتم معالجته', 'rtl');
    expect(node().style.direction).toBe('rtl');
    expect(node().style.top).toBe('60px');
    expect(node().style.textIndent).toBe('200px'); // content.right − caret.left
  });

  it('puts Arabic ghost text on the line below, left-aligned, in a fixed-LTR composer', () => {
    const g = createGhost(el, measureAt({ left: 110, right: 118, top: 60, bottom: 80 }));
    g.show(' وسيتم معالجته', 'rtl');
    const s = node().style;
    expect(s.direction).toBe('rtl');
    expect(s.textAlign).toBe('left');
    expect(s.top).toBe('80px'); // caret line bottom
    expect(s.left).toBe('100px');
    expect(s.textIndent).toBe('0px');
  });

  it('is decorative and lives outside the composer', () => {
    const g = createGhost(el, measureAt({ left: 230, right: 240, top: 60, bottom: 80 }));
    g.show(' x', 'ltr');
    expect(node().getAttribute('aria-hidden')).toBe('true');
    expect(node().style.pointerEvents).toBe('none');
    expect(el.contains(node())).toBe(false);
    expect(el.innerHTML).toBe('text');
  });

  it('hides when the caret line is scrolled out or unknown, and hide/remove clean up', () => {
    const out = createGhost(el, measureAt({ left: 230, right: 240, top: 200, bottom: 220 }));
    out.show(' x', 'ltr');
    expect(node().style.display).toBe('none');
    out.remove();
    const unknown = createGhost(el, measureAt(null));
    unknown.show(' x', 'ltr');
    expect(node().style.display).toBe('none');
    unknown.hide();
    expect(unknown.text).toBe('');
    unknown.remove();
    expect(document.querySelector('[data-bp-ghost]')).toBeNull();
  });
});
