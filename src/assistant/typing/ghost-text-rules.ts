import type { TextDirection } from '../types';

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
