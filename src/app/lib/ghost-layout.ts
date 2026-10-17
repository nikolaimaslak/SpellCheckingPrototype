import type { CSSProperties } from 'react';
import { caretRect, contentRect } from './browser';
import type { TextDirection } from '../../assistant';

export function measureGhost(field: HTMLElement, direction: TextDirection, hasTextBelow: boolean): CSSProperties | null {
  const caret = caretRect(field);
  const content = contentRect(field);
  const style = getComputedStyle(field);
  const caretIsVisible = caret && caret.top >= content.top - 1 && caret.bottom <= content.bottom + 1;
  if (!caretIsVisible) {
    return null;
  }
  const shouldStartOnNextLine = direction === 'rtl' && style.direction === 'ltr';
  const lineHeight = parseFloat(style.lineHeight);
  const halfLeading = Number.isFinite(lineHeight) ? (lineHeight - (caret.bottom - caret.top)) / 2 : 0;
  const indentToCaret = direction === 'rtl' ? content.right - caret.left : caret.right - content.left;
  const top = shouldStartOnNextLine ? caret.bottom + halfLeading : caret.top - halfLeading;
  const spaceToFieldBottom = Math.max(0, content.bottom - parseFloat(style.paddingBottom) - top);
  const spaceBelow = hasTextBelow && Number.isFinite(lineHeight) ? Math.min(lineHeight, spaceToFieldBottom) : spaceToFieldBottom;
  return {
    top,
    maxHeight: Number.isFinite(lineHeight) ? Math.floor(spaceBelow / lineHeight) * lineHeight : spaceBelow,
    overflow: 'hidden',
    left: content.left,
    width: Math.max(0, content.right - content.left),
    textIndent: shouldStartOnNextLine ? 0 : Math.max(0, indentToCaret),
    textAlign: shouldStartOnNextLine ? 'left' : 'start',
    direction,
    font: style.font,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
}
