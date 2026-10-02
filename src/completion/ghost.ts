// Ghost text: a non-interactive overlay outside the editable DOM, so a
// suggestion can never reach the sent message, the host's model or the undo
// history. Its first line starts exactly at the caret (text-indent) and later
// lines wrap within the composer's content box, in the line's own direction.

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface GhostMeasure {
  /** Rect of the character before the caret (or of the caret), null if unknown. */
  caretRect(el: HTMLElement): DOMRect | null;
  /** The composer's content box (border and padding removed), in viewport coordinates. */
  contentBox(el: HTMLElement): Box;
}

export function browserMeasure(): GhostMeasure {
  return {
    caretRect(el) {
      const sel = el.ownerDocument.getSelection();
      if (!sel?.anchorNode || !el.contains(sel.anchorNode)) return null;
      const range = el.ownerDocument.createRange();
      const node = sel.anchorNode;
      if (node.nodeType === Node.TEXT_NODE && sel.anchorOffset > 0) {
        // A collapsed range at a line end can report an empty rect; the
        // previous character's box is reliable.
        range.setStart(node, sel.anchorOffset - 1);
        range.setEnd(node, sel.anchorOffset);
        const rects = range.getClientRects();
        return rects[rects.length - 1] ?? null;
      }
      range.setStart(node, sel.anchorOffset);
      const r = range.getBoundingClientRect();
      return r.height ? r : null;
    },
    contentBox(el) {
      const r = el.getBoundingClientRect();
      const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
      const px = (v: string) => parseFloat(v) || 0;
      return {
        left: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
        right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight),
        top: r.top + px(cs.borderTopWidth),
        bottom: r.bottom - px(cs.borderBottomWidth),
      };
    },
  };
}

export interface Ghost {
  readonly text: string;
  show(text: string, dir: 'ltr' | 'rtl'): void;
  /** Re-measures after edits, scrolling or resizing; hides when the caret line is scrolled out. */
  reposition(): void;
  hide(): void;
  remove(): void;
}

export function createGhost(el: HTMLElement, measure: GhostMeasure = browserMeasure()): Ghost {
  const doc = el.ownerDocument;
  const box = doc.createElement('div');
  box.dataset.bpGhost = '';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483646',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    color: 'rgba(120, 128, 140, 0.9)',
    display: 'none',
    margin: '0',
    padding: '0',
  });
  let text = '';
  let dir: 'ltr' | 'rtl' = 'ltr';

  function reposition() {
    if (!text) return;
    const caret = measure.caretRect(el);
    const content = measure.contentBox(el);
    if (!caret || caret.top < content.top - 1 || caret.bottom > content.bottom + 1) {
      box.style.display = 'none'; // caret unknown or its line scrolled out of view
      return;
    }
    const cs = doc.defaultView!.getComputedStyle(el);
    // An Arabic line in a fixed-LTR composer (Agent Desktop) is pinned to the
    // left edge with the caret at its leftmost glyph: no room to continue on
    // the same line, so continue on the line below, left-aligned, as the host
    // lays out wrapped Arabic text.
    const below = dir === 'rtl' && cs.direction === 'ltr';
    Object.assign(box.style, {
      display: 'block',
      font: cs.font,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      direction: dir,
      textAlign: below ? 'left' : 'start',
      top: `${below ? caret.bottom : caret.top}px`,
      left: `${content.left}px`,
      width: `${Math.max(0, content.right - content.left)}px`,
      textIndent: below ? '0px' : `${Math.max(0, dir === 'rtl' ? content.right - caret.left : caret.right - content.left)}px`,
    });
  }

  return {
    get text() {
      return text;
    },
    show(t, d) {
      text = t;
      dir = d;
      box.textContent = t;
      if (!box.isConnected) doc.body.append(box);
      reposition();
    },
    reposition,
    hide() {
      text = '';
      box.textContent = '';
      box.style.display = 'none';
    },
    remove() {
      text = '';
      box.remove();
    },
  };
}
