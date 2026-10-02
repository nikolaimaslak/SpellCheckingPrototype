// Polish overlays: button, preview panel and revert toast. All live in
// document.body, outside the editable DOM, and are removed on detach.
import type { Segment } from './diff';

const BASE = {
  font: '13px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
  color: '#1c2430',
  background: '#fff',
  border: '1px solid #c7cdd6',
  borderRadius: '6px',
  boxShadow: '0 4px 16px rgba(0,0,0,.18)',
  zIndex: '2147483646',
  colorScheme: 'light',
};

const buttonStyle = (el: HTMLElement) =>
  Object.assign(el.style, { font: 'inherit', padding: '3px 10px', border: '1px solid #c7cdd6', borderRadius: '4px', background: '#fff', color: '#1c2430', cursor: 'pointer' });

export interface PolishButton {
  element: HTMLButtonElement;
  setEnabled(enabled: boolean): void;
  setBusy(busy: boolean): void;
  reposition(): void;
  remove(): void;
}

/** Small "Polish" button just outside the composer's top corner (inline-end side). */
export function createPolishButton(composer: HTMLElement, onClick: () => void): PolishButton {
  const doc = composer.ownerDocument;
  const win = doc.defaultView!;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.dataset.bpPolishButton = '';
  btn.textContent = 'Polish';
  btn.setAttribute('aria-label', 'Polish grammar and spelling');
  btn.title = 'Polish grammar and spelling';
  Object.assign(btn.style, BASE, { position: 'fixed', padding: '2px 8px', cursor: 'pointer', boxShadow: 'none' });
  // Keep the composer's focus and caret when clicked.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => !btn.disabled && onClick());
  doc.body.append(btn);
  let enabled = false;
  let busy = false;
  const sync = () => {
    btn.disabled = !enabled || busy;
    btn.style.opacity = btn.disabled ? '0.55' : '1';
    btn.textContent = busy ? 'Polishing…' : 'Polish';
  };

  function reposition() {
    const r = composer.getBoundingClientRect();
    const rtl = win.getComputedStyle(composer).direction === 'rtl';
    const w = btn.offsetWidth || 64;
    const h = btn.offsetHeight || 24;
    let left = rtl ? r.left - w - 4 : r.right + 4;
    // No room outside: tuck it inside the top corner instead.
    if (left + w > win.innerWidth || left < 0) left = rtl ? r.left + 4 : r.right - w - 4;
    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(Math.max(0, r.top - (left >= r.left && left + w <= r.right ? h + 4 : 0)))}px`;
  }
  sync();
  reposition();
  return {
    element: btn,
    setEnabled(v) {
      enabled = v;
      sync();
    },
    setBusy(v) {
      busy = v;
      sync();
    },
    reposition,
    remove: () => btn.remove(),
  };
}

export interface PanelOptions {
  composer: HTMLElement;
  dir: 'ltr' | 'rtl';
  /** Changes to show; empty with `message` for "no changes" or "unavailable". */
  segments: Segment[];
  message?: string;
  onAccept?: () => void;
  onDismiss: () => void;
}

export interface PolishPanel {
  element: HTMLElement;
  /** Replaces the actions with a message and a Close button (e.g. stale draft). */
  showMessage(text: string): void;
  close(): void;
}

export function openPolishPanel(opts: PanelOptions): PolishPanel {
  const doc = opts.composer.ownerDocument;
  const win = doc.defaultView!;
  const panel = doc.createElement('div');
  panel.dataset.bpPolishPanel = '';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Grammar and spelling suggestions');
  Object.assign(panel.style, BASE, { position: 'fixed', padding: '10px 12px', maxWidth: '520px' });
  panel.addEventListener('mousedown', (e) => {
    if (!(e.target as HTMLElement).closest('button')) e.preventDefault();
  });

  const body = doc.createElement('div');
  body.dir = opts.dir;
  Object.assign(body.style, { whiteSpace: 'pre-wrap', lineHeight: '1.5', marginBottom: '8px', textAlign: 'start' });
  for (const s of opts.segments) {
    const node = doc.createElement(s.type === 'ins' ? 'ins' : s.type === 'del' ? 'del' : 'span');
    node.textContent = s.text;
    if (s.type === 'ins') Object.assign(node.style, { background: 'rgba(47,125,79,.16)', color: '#1d5e38', textDecoration: 'none', borderRadius: '3px' });
    if (s.type === 'del') Object.assign(node.style, { color: '#b23a3a', textDecorationColor: '#b23a3a' });
    body.append(node);
  }
  const note = doc.createElement('p');
  Object.assign(note.style, { margin: '0 0 8px', color: '#5d6878' });
  const actions = doc.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

  const addButton = (label: string, run: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    buttonStyle(b);
    b.addEventListener('click', run);
    actions.append(b);
    return b;
  };

  let open = true;
  function close() {
    if (!open) return;
    open = false;
    win.removeEventListener('keydown', onKey, true);
    panel.remove();
  }
  function setMessage(text: string) {
    note.textContent = text;
    actions.replaceChildren();
    addButton('Close', () => {
      close();
      opts.onDismiss();
    });
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation(); // the host never sees it
    close();
    opts.onDismiss();
  };

  if (opts.segments.length && opts.onAccept) {
    panel.append(body);
    addButton('Dismiss', () => {
      close();
      opts.onDismiss();
    });
    const accept = addButton('Accept', () => opts.onAccept!());
    accept.style.fontWeight = '600';
  } else {
    setMessage(opts.message ?? 'No changes suggested.');
  }
  panel.append(note, actions);
  if (!note.textContent) note.remove();
  win.addEventListener('keydown', onKey, true);
  doc.body.append(panel);

  // Below the composer, or above it when there is no room.
  const r = opts.composer.getBoundingClientRect();
  const h = panel.offsetHeight;
  const top = r.bottom + 6 + h > win.innerHeight && r.top - 6 - h >= 0 ? r.top - 6 - h : r.bottom + 6;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(Math.max(4, Math.min(r.left, win.innerWidth - panel.offsetWidth - 4)))}px`;

  return {
    element: panel,
    showMessage(text) {
      if (!note.isConnected) panel.insertBefore(note, actions);
      setMessage(text);
    },
    close,
  };
}

/** "Polish applied · Revert polish" for a limited time. */
export function showRevertToast(composer: HTMLElement, onRevert: () => void, ms = 10_000): { remove(): void } {
  const doc = composer.ownerDocument;
  const toast = doc.createElement('div');
  toast.dataset.bpPolishToast = '';
  toast.setAttribute('role', 'status');
  Object.assign(toast.style, BASE, { position: 'fixed', padding: '6px 10px', display: 'flex', gap: '10px', alignItems: 'center' });
  const label = doc.createElement('span');
  label.textContent = 'Polish applied';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Revert polish';
  buttonStyle(btn);
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  toast.append(label, btn);
  doc.body.append(toast);
  const r = composer.getBoundingClientRect();
  toast.style.top = `${Math.round(r.bottom + 6)}px`;
  toast.style.left = `${Math.round(r.left)}px`;
  const timer = setTimeout(() => toast.remove(), ms);
  const remove = () => {
    clearTimeout(timer);
    toast.remove();
  };
  btn.addEventListener('click', () => {
    remove();
    onRevert();
  });
  return { remove };
}
