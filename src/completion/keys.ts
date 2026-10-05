/** What a key press does while ghost text is showing. */
export type GhostKeyAction = 'accept-all' | 'accept-word' | 'dismiss' | 'escape' | 'none';

/** The parts of a KeyboardEvent the classifier looks at (lets tests pass plain objects). */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const DISMISS = new Set(['Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * Tab or the forward arrow (the one pointing in the suggestion's reading
 * direction) accepts it all; Ctrl + forward arrow (Option + forward arrow on
 * macOS, where Ctrl+arrow switches desktops) accepts the next word. Alt is
 * never used elsewhere: Alt+Left is the browser's Back. Other navigation
 * dismisses without being intercepted.
 */
export function ghostKeyAction(e: KeyLike, dir: 'ltr' | 'rtl', isMac: boolean): GhostKeyAction {
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (e.key === 'Tab') return plain ? 'accept-all' : 'none';
  if (e.key === 'Escape') return 'escape';
  if (e.key === forward) {
    if (plain) return 'accept-all';
    const wordModifier = isMac ? e.altKey && !e.ctrlKey : e.ctrlKey && !e.altKey;
    return wordModifier && !e.shiftKey && !e.metaKey ? 'accept-word' : 'dismiss';
  }
  if (e.key === backward || DISMISS.has(e.key)) return 'dismiss';
  return 'none';
}

/** The ghost text's next word: any leading whitespace, then everything up to the next whitespace. */
export function nextWord(text: string): string {
  return /^\s*\S+/u.exec(text)?.[0] ?? text;
}

/** macOS, where Option (not Ctrl) is the word-jump modifier. */
export function detectMac(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined): boolean {
  const data = (nav as { userAgentData?: { platform?: string } } | undefined)?.userAgentData?.platform;
  return /mac/i.test(data ?? nav?.platform ?? '');
}
