// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildTextMap, caretOffset, flatOffsetOf, rangeFor } from '../../src/tokenizer';

const el = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.replaceChildren(div);
  return div;
};

describe('buildTextMap', () => {
  it('joins inline formatting into one word across nodes', () => {
    const root = el('<b>rec</b>eive it');
    const map = buildTextMap(root);
    expect(map.text).toBe('receive it');
    expect(map.segments).toHaveLength(2);
    const range = rangeFor(map, 0, 7);
    expect(range.toString()).toBe('receive');
    expect(range.startContainer).not.toBe(range.endContainer);
  });

  it('emits separators for br, blocks and images', () => {
    expect(buildTextMap(el('hello<br>world')).text).toBe('hello\nworld');
    expect(buildTextMap(el('<div>one</div><div>two</div>')).text).toBe('one\ntwo\n');
    expect(buildTextMap(el('word<img alt="😊">next')).text).toBe('word￼next');
    expect(buildTextMap(el('<p>a b</p>tail')).text).toBe('a b\ntail');
  });

  it('maps element boundary points and the caret to flat offsets', () => {
    const root = el('<b>rec</b>eive');
    const map = buildTextMap(root);
    expect(flatOffsetOf(map, root, 1)).toBe(3); // before the "eive" text node
    expect(flatOffsetOf(map, root, 2)).toBe(7); // end
    const sel = document.getSelection()!;
    sel.collapse(root.lastChild!, 2);
    expect(caretOffset(map, sel)).toBe(5);
    sel.collapse(document.body, 0);
    expect(caretOffset(map, sel)).toBeUndefined();
  });
});

describe('pointAt', () => {
  it('resolves offsets inside and across formatting, preferring the earlier segment at a boundary', async () => {
    const { pointAt } = await import('../../src/tokenizer');
    const root = el('<b>rec</b>eive it');
    const map = buildTextMap(root);
    const bold = root.firstChild!.firstChild!;
    const tail = root.lastChild!;
    expect(pointAt(map, 1)).toEqual({ node: bold, offset: 1 });
    expect(pointAt(map, 3)).toEqual({ node: bold, offset: 3 }); // boundary → end of "rec"
    expect(pointAt(map, 5)).toEqual({ node: tail, offset: 2 });
    expect(pointAt(map, map.text.length)).toEqual({ node: tail, offset: tail.textContent!.length });
  });

  it('round-trips with flatOffsetOf', async () => {
    const { pointAt } = await import('../../src/tokenizer');
    const root = el('one <i>two</i> three');
    const map = buildTextMap(root);
    for (let i = 0; i <= map.text.length; i++) {
      const p = pointAt(map, i);
      expect(flatOffsetOf(map, p.node, p.offset)).toBe(i);
    }
  });

  it('falls back to the composer end when there is no text', async () => {
    const { pointAt } = await import('../../src/tokenizer');
    const root = el('<br>');
    const map = buildTextMap(root);
    expect(pointAt(map, 1)).toEqual({ node: root, offset: 1 });
  });
});
