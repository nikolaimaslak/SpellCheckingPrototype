/** A text node's slice of the flattened composer text. */
export interface TextSegment {
  node: Text;
  flatStart: number;
  length: number;
}

/**
 * The composer's text flattened to one string, with a table mapping every
 * character back to its text node. Line breaks, blocks and inline images
 * contribute separator characters that map to no node, so words never span
 * them; inline formatting contributes nothing, so `<b>rec</b>eive` is one word.
 */
export interface TextMap {
  root: Node;
  text: string;
  segments: TextSegment[];
}

const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR', 'TD', 'TH']);
const OBJECT = '￼';

export function buildTextMap(root: Node): TextMap {
  let text = '';
  const segments: TextSegment[] = [];
  const separate = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data;
      if (data) {
        segments.push({ node: node as Text, flatStart: text.length, length: data.length });
        text += data;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName;
    if (tag === 'BR') {
      text += '\n';
      return;
    }
    if (tag === 'IMG') {
      text += OBJECT;
      return;
    }
    const block = BLOCKS.has(tag);
    if (block) separate();
    node.childNodes.forEach(walk);
    if (block) separate();
  };

  root.childNodes.forEach(walk);
  return { root, text, segments };
}

/** Maps a DOM boundary point inside the composer to a flat-text offset. */
export function flatOffsetOf(map: TextMap, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const seg = map.segments.find((s) => s.node === node);
    if (seg) return seg.flatStart + Math.min(offset, seg.length);
  }
  // Element boundary (or an unmapped text node): the offset of the first text
  // segment at or after the point.
  const point = (node.ownerDocument ?? document).createRange();
  point.setStart(node, offset);
  for (const seg of map.segments) {
    if (point.comparePoint(seg.node, 0) >= 0) return seg.flatStart;
  }
  return map.text.length;
}

/** The caret's flat offset, or undefined when there is no collapsed caret in the composer. */
export function caretOffset(map: TextMap, selection: Selection | null): number | undefined {
  if (!selection || !selection.isCollapsed || !selection.anchorNode) return undefined;
  if (!map.root.contains(selection.anchorNode)) return undefined;
  return flatOffsetOf(map, selection.anchorNode, selection.anchorOffset);
}

/** A live Range covering flat offsets [start, end), which may span text nodes. */
export function rangeFor(map: TextMap, start: number, end: number): Range {
  const startSeg = map.segments.find((s) => start >= s.flatStart && start < s.flatStart + s.length);
  const endSeg = map.segments.find((s) => end > s.flatStart && end <= s.flatStart + s.length);
  if (!startSeg || !endSeg) throw new Error(`no text at flat range ${start}-${end}`);
  const range = (map.root.ownerDocument ?? document).createRange();
  range.setStart(startSeg.node, start - startSeg.flatStart);
  range.setEnd(endSeg.node, end - endSeg.flatStart);
  return range;
}
