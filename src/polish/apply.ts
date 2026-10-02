import { buildTextMap, pointAt, rangeFor, type TextMap } from '../tokenizer';
import type { Hunk } from './diff';

/** One applied change: a live range over the new text, and what it replaced. */
export interface AppliedSpan {
  range: Range;
  original: string;
  replacement: string;
}

export type ApplyResult = { ok: false; reason: 'stale' } | { ok: true; mode: 'single' | 'per-span'; spans: AppliedSpan[] };

type Replace = (range: Range, text: string) => void;

function rangeAt(map: TextMap, start: number, end: number): Range {
  if (start < end) return rangeFor(map, start, end);
  const p = pointAt(map, start);
  const r = (map.root.ownerDocument ?? document).createRange();
  r.setStart(p.node, p.offset);
  return r;
}

/** The text segment a hunk sits in, or undefined when it crosses formatting. */
function segmentOf(map: TextMap, h: Hunk) {
  return map.segments.find((s) => h.start >= s.flatStart && h.end <= s.flatStart + s.length);
}

/**
 * Applies polish hunks to the composer through the native edit path.
 * - All hunks inside one text run: a single replace, so one Undo reverts it.
 * - Otherwise: one replace per hunk, last to first, so formatting at each
 *   position survives; the returned spans allow a one-click revert.
 * Refuses if the composer no longer holds the text that was polished.
 */
export function applyPolish(el: HTMLElement, sent: string, hunks: Hunk[], replace: Replace): ApplyResult {
  const map = buildTextMap(el);
  if (map.text !== sent) return { ok: false, reason: 'stale' };
  if (!hunks.length) return { ok: true, mode: 'single', spans: [] };

  const sorted = [...hunks].sort((x, y) => x.start - y.start);
  const segs = sorted.map((h) => segmentOf(map, h));
  const single = segs.every((s) => s && s === segs[0]);

  if (single) {
    const start = sorted[0].start;
    const end = sorted[sorted.length - 1].end;
    let text = '';
    let at = start;
    for (const h of sorted) {
      text += sent.slice(at, h.start) + h.text;
      at = h.end;
    }
    text += sent.slice(at, end);
    replace(rangeAt(map, start, end), text);
    const after = buildTextMap(el);
    return { ok: true, mode: 'single', spans: [{ range: rangeAt(after, start, start + text.length), original: sent.slice(start, end), replacement: text }] };
  }

  const spans: AppliedSpan[] = [];
  for (const h of [...sorted].reverse()) {
    // Going last to first keeps every earlier offset valid.
    replace(rangeAt(buildTextMap(el), h.start, h.end), h.text);
    spans.push({ range: rangeAt(buildTextMap(el), h.start, h.start + h.text.length), original: sent.slice(h.start, h.end), replacement: h.text });
  }
  return { ok: true, mode: 'per-span', spans };
}

/** Restores every span that still holds its replacement (spans are last-to-first). */
export function revertSpans(spans: AppliedSpan[], replace: Replace): number {
  let reverted = 0;
  for (const s of spans) {
    if (s.range.toString() !== s.replacement) continue;
    replace(s.range, s.original);
    reverted++;
  }
  return reverted;
}
