// Suggestion popover. Lives in document.body, outside the editable region, and
// captures the keys it handles at window level so the host (where Enter sends a
// chat message) never sees them.

export interface PopoverOptions {
  document: Document;
  anchor: DOMRect;
  dir: 'ltr' | 'rtl';
  suggestions: string[];
  /** Font of the composer, so the popover reads like part of it. */
  font?: string;
  onPick(suggestion: string): void;
  onIgnore(): void;
  /** Called after any close; `restoreFocus` is true for Escape. */
  onClose(restoreFocus: boolean): void;
}

export interface PopoverHandle {
  element: HTMLElement;
  close(restoreFocus?: boolean): void;
}

const MAX = 5;
const GAP = 4;

export function openPopover(opts: PopoverOptions): PopoverHandle {
  const doc = opts.document;
  const win = doc.defaultView ?? window;
  const box = doc.createElement('div');
  box.dataset.bpSpellPopover = '';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', 'Spelling suggestions');
  box.dir = opts.dir;
  Object.assign(box.style, {
    position: 'fixed',
    zIndex: '2147483647',
    minWidth: '140px',
    padding: '4px 0',
    background: '#fff',
    color: '#1c2430',
    border: '1px solid #c7cdd6',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,.18)',
    font: opts.font ?? 'inherit',
    textAlign: 'start',
    colorScheme: 'light',
  });

  type Item = { el: HTMLElement; run: () => void };
  const items: Item[] = [];
  const addItem = (label: string, run: () => void, extra: Partial<CSSStyleDeclaration> = {}) => {
    const el = doc.createElement('div');
    el.setAttribute('role', 'option');
    el.textContent = label;
    Object.assign(el.style, { padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }, extra);
    el.addEventListener('click', run);
    el.addEventListener('mouseenter', () => focusItem(items.findIndex((i) => i.el === el)));
    // (findIndex always succeeds here: the item is pushed below before any hover.)
    box.append(el);
    items.push({ el, run });
  };

  const suggestions = opts.suggestions.slice(0, MAX);
  for (const s of suggestions) addItem(s, () => finish(() => opts.onPick(s)), { fontWeight: '600' });
  if (!suggestions.length) {
    const none = doc.createElement('div');
    none.setAttribute('role', 'presentation');
    none.textContent = 'No suggestions';
    Object.assign(none.style, { padding: '4px 12px', color: '#5d6878', fontStyle: 'italic' });
    box.append(none);
  }
  const sep = doc.createElement('div');
  sep.setAttribute('role', 'separator');
  Object.assign(sep.style, { borderTop: '1px solid #e3e7ec', margin: '4px 0' });
  box.append(sep);
  addItem('Ignore', () => finish(opts.onIgnore));

  let focused = 0;
  function focusItem(i: number) {
    focused = (i + items.length) % items.length;
    items.forEach((it, j) => {
      it.el.setAttribute('aria-selected', String(j === focused));
      it.el.style.background = j === focused ? '#e8f0fb' : '';
    });
  }
  focusItem(0);

  // Keep the composer's focus and selection while interacting with the popover.
  box.addEventListener('mousedown', (e) => e.preventDefault());

  let open = true;
  const onKey = (e: KeyboardEvent) => {
    const handled = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key);
    if (!handled) {
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) close(false);
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'ArrowDown') focusItem(focused + 1);
    else if (e.key === 'ArrowUp') focusItem(focused - 1);
    else if (e.key === 'Enter') items[focused].run();
    else close(true);
  };
  const onOutside = (e: MouseEvent) => {
    if (!box.contains(e.target as Node)) close(false);
  };

  // A choice keeps focus in the composer, where the replacement happens.
  function finish(action: () => void) {
    close(true);
    action();
  }

  function close(restoreFocus = false) {
    if (!open) return;
    open = false;
    win.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('mousedown', onOutside, true);
    win.removeEventListener('resize', onDismiss);
    win.removeEventListener('scroll', onDismiss, true);
    box.remove();
    opts.onClose(restoreFocus);
  }
  const onDismiss = () => close(false);

  win.addEventListener('keydown', onKey, true);
  doc.addEventListener('mousedown', onOutside, true);
  win.addEventListener('resize', onDismiss);
  win.addEventListener('scroll', onDismiss, true);

  doc.body.append(box);
  place(box, opts.anchor, opts.dir, win);
  return { element: box, close: (restoreFocus = false) => close(restoreFocus) };
}

/** Below the word (above near the viewport bottom), start-aligned to it, clamped to the viewport. */
function place(box: HTMLElement, anchor: DOMRect, dir: 'ltr' | 'rtl', win: Window) {
  const { width, height } = box.getBoundingClientRect();
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  let top = anchor.bottom + GAP;
  if (top + height > vh && anchor.top - GAP - height >= 0) top = anchor.top - GAP - height;
  let left = dir === 'rtl' ? anchor.right - width : anchor.left;
  left = Math.max(GAP, Math.min(left, vw - width - GAP));
  box.style.top = `${Math.round(top)}px`;
  box.style.left = `${Math.round(left)}px`;
}
