/** A change to the draft: replace draft[start, end) with `text` (start === end is an insertion). */
export interface Hunk {
  start: number;
  end: number;
  text: string;
}

/** Display pieces for the preview panel, in draft order. */
export interface Segment {
  type: 'eq' | 'del' | 'ins';
  text: string;
}

interface Tok {
  text: string;
  start: number;
}

// Words keep their combining marks (Arabic tashkeel stays in its word); each
// newline is its own token so line structure is matched explicitly.
const TOKEN = /[\p{L}\p{M}\p{N}]+|[^\S\n]+|\n|[^\p{L}\p{M}\p{N}\s]/gu;

function tokens(s: string): Tok[] {
  return [...s.matchAll(TOKEN)].map((m) => ({ text: m[0], start: m.index }));
}

/**
 * Word-level diff of `draft` → `polished`: the minimal hunks to apply and the
 * segments to display. Hunks touching a line break are dropped (the service
 * already guarantees equal line counts; edits never merge or split lines).
 */
export function diff(draft: string, polished: string): { hunks: Hunk[]; segments: Segment[] } {
  const a = tokens(draft);
  const b = tokens(polished);
  // LCS table over token texts.
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i].text === b[j].text ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: Segment[] = [];
  const hunks: Hunk[] = [];
  let pending: { start: number; end: number; del: string; ins: string } | null = null;
  const push = (type: Segment['type'], text: string) => {
    const last = segments.at(-1);
    if (last?.type === type) last.text += text;
    else segments.push({ type, text });
  };
  const flush = () => {
    if (!pending) return;
    if (!pending.del.includes('\n') && !pending.ins.includes('\n')) hunks.push({ start: pending.start, end: pending.end, text: pending.ins });
    pending = null;
  };

  let i = 0;
  let j = 0;
  const posA = (k: number) => (k < n ? a[k].start : draft.length);
  while (i < n || j < m) {
    if (i < n && j < m && a[i].text === b[j].text) {
      flush();
      push('eq', a[i].text);
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] > lcs[i + 1][j])) {
      pending ??= { start: posA(i), end: posA(i), del: '', ins: '' };
      pending.ins += b[j].text;
      push('ins', b[j].text);
      j++;
    } else {
      pending ??= { start: posA(i), end: posA(i), del: '', ins: '' };
      pending.del += a[i].text;
      pending.end = a[i].start + a[i].text.length;
      push('del', a[i].text);
      i++;
    }
  }
  flush();
  return { hunks, segments };
}
