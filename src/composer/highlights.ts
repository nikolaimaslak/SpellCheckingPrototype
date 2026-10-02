// One shared CSS Custom Highlight for every attached composer. Highlights paint
// over text without touching the editable DOM, so underlines can never reach a
// sent message or the host's undo history.

export const HIGHLIGHT_NAME = 'bp-spelling-error';
const STYLE = `::highlight(${HIGHLIGHT_NAME}) { text-decoration: underline wavy #d93025; text-decoration-skip-ink: none; text-underline-offset: 2px; }`;

export interface HighlightLike {
  add(range: Range): unknown;
  delete(range: Range): unknown;
}

export interface HighlightEnv {
  registry: { set(name: string, highlight: HighlightLike): unknown; delete(name: string): unknown };
  createHighlight(): HighlightLike;
  document: Document;
}

export function browserHighlightEnv(doc: Document = document): HighlightEnv {
  return {
    registry: CSS.highlights as unknown as HighlightEnv['registry'],
    createHighlight: () => new Highlight() as unknown as HighlightLike,
    document: doc,
  };
}

interface Shared {
  highlight: HighlightLike;
  style: HTMLStyleElement;
  owners: number;
}

const sharedByRegistry = new WeakMap<object, Shared>();

export interface HighlightOwner {
  /** Replaces this owner's ranges; other owners' ranges are untouched. */
  setRanges(ranges: Iterable<Range>): void;
  /** Drops this owner's ranges; the last release removes the highlight and style. */
  release(): void;
}

export function acquireHighlights(env: HighlightEnv): HighlightOwner {
  let shared = sharedByRegistry.get(env.registry);
  if (!shared) {
    const style = env.document.createElement('style');
    style.dataset.bpSpell = '';
    style.textContent = STYLE;
    env.document.head.append(style);
    const highlight = env.createHighlight();
    env.registry.set(HIGHLIGHT_NAME, highlight);
    shared = { highlight, style, owners: 0 };
    sharedByRegistry.set(env.registry, shared);
  }
  shared.owners++;
  const s = shared;
  let mine = new Set<Range>();
  let released = false;

  return {
    setRanges(ranges) {
      if (released) return;
      for (const r of mine) s.highlight.delete(r);
      mine = new Set(ranges);
      for (const r of mine) s.highlight.add(r);
    },
    release() {
      if (released) return;
      released = true;
      for (const r of mine) s.highlight.delete(r);
      mine.clear();
      if (--s.owners === 0) {
        env.registry.delete(HIGHLIGHT_NAME);
        s.style.remove();
        sharedByRegistry.delete(env.registry);
      }
    },
  };
}
