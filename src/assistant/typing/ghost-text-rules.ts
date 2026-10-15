import type { GhostLayout, Rect, TextDirection } from '../types';

export type GhostKeyAction = 'accept-all' | 'accept-word' | 'escape' | 'none';

export function ghostKeyAction(event: KeyboardEvent, direction: TextDirection, isMac: boolean): GhostKeyAction {
  const forwardArrow = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const noModifiers = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  const wordJumpModifier = isMac ? event.altKey && !event.ctrlKey : event.ctrlKey && !event.altKey;

  if (event.key === 'Tab') {
    return noModifiers ? 'accept-all' : 'none';
  }
  if (event.key === 'Escape') {
    return 'escape';
  }
  if (event.key === forwardArrow) {
    if (noModifiers) {
      return 'accept-all';
    }
    return wordJumpModifier && !event.shiftKey && !event.metaKey ? 'accept-word' : 'none';
  }
  return 'none';
}

export function nextWord(text: string): string {
  return /^\s*\S+/u.exec(text)?.[0] ?? text;
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
  const indentToCaret = direction === 'rtl' ? content.right - caret.left : caret.right - content.left;
  return {
    top: startOnNextLine ? caret.bottom : caret.top,
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
