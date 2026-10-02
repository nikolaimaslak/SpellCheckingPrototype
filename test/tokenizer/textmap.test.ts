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
