// CSS Custom Highlights paint over text without touching the editable DOM, so
// underlines and auto-correct flashes never reach the message or the undo
// history. Their look is in the page's CSS (::highlight(...)).

export const SPELLING_ERROR = 'bp-spelling-error';
export const AUTOCORRECTED = 'bp-autocorrected';

export interface HighlightLike {
  add(range: Range): unknown;
  clear(): unknown;
}

/** The browser's highlight registry; tests pass a fake. */
export interface HighlightEnv {
  registry: { set(name: string, highlight: HighlightLike): unknown; delete(name: string): unknown };
  createHighlight(): HighlightLike;
}

export const browserHighlights = (): HighlightEnv => ({
  registry: CSS.highlights as unknown as HighlightEnv['registry'],
  createHighlight: () => new Highlight() as unknown as HighlightLike,
});

/** One named highlight: setRanges replaces what it paints; release removes it. */
export function createHighlight(env: HighlightEnv, name: string) {
  const highlight = env.createHighlight();
  env.registry.set(name, highlight);
  return {
    setRanges(ranges: Iterable<Range>) {
      highlight.clear();
      for (const r of ranges) highlight.add(r);
    },
    release() {
      highlight.clear();
      env.registry.delete(name);
    },
  };
}
