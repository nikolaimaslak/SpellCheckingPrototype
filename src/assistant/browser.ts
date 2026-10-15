import type { Rect } from './types';

export function replaceText(field: HTMLElement, range: Range, text: string) {
  field.focus();
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('insertText', false, text);
}

export function selectedRange(): Range | undefined {
  const selection = document.getSelection();
  return selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined;
}

export function restoreSelection(field: HTMLElement, range: Range) {
  field.focus();
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

export function caretRange(): Range | undefined {
  const range = selectedRange();
  range?.collapse(false);
  return range;
}

const toRect = (box: DOMRect): Rect => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });

export function rectOfRange(range: Range): Rect {
  return toRect(range.getClientRects()[0] ?? range.getBoundingClientRect());
}

export function caretRect(field: HTMLElement): Rect | null {
  const selection = document.getSelection();
  const node = selection?.anchorNode;
  if (!selection || !node || !field.contains(node)) return null;
  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
    range.setStart(node, selection.anchorOffset - 1);
    range.setEnd(node, selection.anchorOffset);
    const characterRects = range.getClientRects();
    return characterRects.length ? toRect(characterRects[characterRects.length - 1]) : null;
  }
  range.setStart(node, selection.anchorOffset);
  const box = range.getBoundingClientRect();
  return box.height ? toRect(box) : null;
}

export function contentRect(field: HTMLElement): Rect {
  const box = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const pixels = (value: string) => parseFloat(value) || 0;
  return {
    left: box.left + pixels(style.borderLeftWidth) + pixels(style.paddingLeft),
    right: box.right - pixels(style.borderRightWidth) - pixels(style.paddingRight),
    top: box.top + pixels(style.borderTopWidth),
    bottom: box.bottom - pixels(style.borderBottomWidth),
  };
}

export const isMac = /mac/i.test(
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform,
);

export function createHighlight(name: string) {
  const highlight = new Highlight();
  CSS.highlights.set(name, highlight);
  return {
    show(ranges: Range[]) {
      highlight.clear();
      ranges.forEach((range) => highlight.add(range));
    },
    remove() {
      highlight.clear();
      CSS.highlights.delete(name);
    },
  };
}
