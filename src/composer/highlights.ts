// Named CSS Custom Highlights shared by every attached composer. Highlights
// paint over text without touching the editable DOM, so underlines and
// auto-correct flashes can never reach a sent message or the undo history.

export const HIGHLIGHT_NAME = 'bp-spelling-error';
export const AUTOCORRECT_HIGHLIGHT = 'bp-autocorrected';

const STYLE = [
  `::highlight(${HIGHLIGHT_NAME}) { text-decoration: underline wavy #d93025; text-decoration-skip-ink: none; text-underline-offset: 2px; }`,
  `::highlight(${AUTOCORRECT_HIGHLIGHT}) { background-color: rgba(43, 108, 176, 0.18); }`,
].join('\n');

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

/** Per registry: one style element and one Highlight per name, ref-counted. */
interface Shared {
  style: HTMLStyleElement;
  highlights: Map<string, { highlight: HighlightLike; owners: number }>;
  owners: number;
}

const sharedByRegistry = new WeakMap<object, Shared>();

export interface HighlightOwner {
  /** Replaces this owner's ranges; other owners' ranges are untouched. */
  setRanges(ranges: Iterable<Range>): void;
  /** Drops this owner's ranges; the last release removes the highlight (and the style). */
  release(): void;
}

export function acquireHighlights(env: HighlightEnv, name: string = HIGHLIGHT_NAME): HighlightOwner {
  let shared = sharedByRegistry.get(env.registry);
  if (!shared) {
    const style = env.document.createElement('style');
    style.dataset.bpSpell = '';
    style.textContent = STYLE;
    env.document.head.append(style);
    shared = { style, highlights: new Map(), owners: 0 };
    sharedByRegistry.set(env.registry, shared);
  }
  let entry = shared.highlights.get(name);
  if (!entry) {
    entry = { highlight: env.createHighlight(), owners: 0 };
    env.registry.set(name, entry.highlight);
    shared.highlights.set(name, entry);
  }
  shared.owners++;
  entry.owners++;
  const s = shared;
  const e = entry;
  let mine = new Set<Range>();
  let released = false;

  return {
    setRanges(ranges) {
      if (released) return;
      for (const r of mine) e.highlight.delete(r);
      mine = new Set(ranges);
      for (const r of mine) e.highlight.add(r);
    },
    release() {
      if (released) return;
      released = true;
      for (const r of mine) e.highlight.delete(r);
      mine.clear();
      if (--e.owners === 0) {
        env.registry.delete(name);
        s.highlights.delete(name);
      }
      if (--s.owners === 0) {
        s.style.remove();
        sharedByRegistry.delete(env.registry);
      }
    },
  };
}
