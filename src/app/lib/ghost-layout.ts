import { caretRect, contentRect } from '../../assistant/browser';
import type { Rect, TextDirection } from '../../assistant/types';

export interface GhostLayout {
  top: number;
  left: number;
  width: number;
  textIndent: number;
  textAlign: 'start' | 'left';
  direction: TextDirection;
  font: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface FieldStyle {
  font: string;
  lineHeight: string;
  letterSpacing: string;
  direction: string;
}

export function ghostLayout(caret: Rect | null, content: Rect, fieldStyle: FieldStyle, direction: TextDirection): GhostLayout | null {
  const caretIsVisible = caret && caret.top >= content.top - 1 && caret.bottom <= content.bottom + 1;
  if (!caretIsVisible) {
    return null;
  }
  const startOnNextLine = direction === 'rtl' && fieldStyle.direction === 'ltr';
  const lineHeight = parseFloat(fieldStyle.lineHeight);
  const halfLeading = Number.isFinite(lineHeight) ? (lineHeight - (caret.bottom - caret.top)) / 2 : 0;
  const indentToCaret = direction === 'rtl' ? content.right - caret.left : caret.right - content.left;
  return {
    top: startOnNextLine ? caret.bottom + halfLeading : caret.top - halfLeading,
    left: content.left,
    width: Math.max(0, content.right - content.left),
    textIndent: startOnNextLine ? 0 : Math.max(0, indentToCaret),
    textAlign: startOnNextLine ? 'left' : 'start',
    direction,
    font: fieldStyle.font,
    lineHeight: fieldStyle.lineHeight,
    letterSpacing: fieldStyle.letterSpacing,
  };
}

export function measureGhost(field: HTMLElement, direction: TextDirection): GhostLayout | null {
  const style = getComputedStyle(field);
  const fieldStyle: FieldStyle = { font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, direction: style.direction };
  return ghostLayout(caretRect(field), contentRect(field), fieldStyle, direction);
}
