interface TextPiece {
  node: Text;
  start: number;
  length: number;
}

export interface FieldText {
  field: HTMLElement;
  text: string;
  pieces: TextPiece[];
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR', 'TD', 'TH']);
const IMAGE_PLACEHOLDER = '￼';

export function readFieldText(field: HTMLElement): FieldText {
  let text = '';
  const pieces: TextPiece[] = [];
  const startNewLine = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data;
      if (data) {
        pieces.push({ node: node as Text, start: text.length, length: data.length });
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
      text += IMAGE_PLACEHOLDER;
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) startNewLine();
    node.childNodes.forEach(visit);
    if (isBlock) startNewLine();
  };

  field.childNodes.forEach(visit);
  return { field, text, pieces };
}

export function caretOffset(fieldText: FieldText): number | undefined {
  const selection = document.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !fieldText.field.contains(selection.anchorNode)) return undefined;
  return offsetOfDomPoint(fieldText, selection.anchorNode, selection.anchorOffset);
}

function offsetOfDomPoint(fieldText: FieldText, node: Node, offsetInNode: number): number {
  const piece = fieldText.pieces.find((candidate) => candidate.node === node);
  if (piece) return piece.start + Math.min(offsetInNode, piece.length);

  const point = document.createRange();
  point.setStart(node, offsetInNode);
  const firstPieceAfter = fieldText.pieces.find((candidate) => point.comparePoint(candidate.node, 0) >= 0);
  return firstPieceAfter?.start ?? fieldText.text.length;
}

export function rangeOf(fieldText: FieldText, start: number, end: number): Range {
  const startPiece = fieldText.pieces.find((piece) => start >= piece.start && start < piece.start + piece.length);
  const endPiece = fieldText.pieces.find((piece) => end > piece.start && end <= piece.start + piece.length);
  if (!startPiece || !endPiece) throw new Error(`no text at ${start}-${end}`);
  const range = document.createRange();
  range.setStart(startPiece.node, start - startPiece.start);
  range.setEnd(endPiece.node, end - endPiece.start);
  return range;
}

export function placeCaret(fieldText: FieldText, offset: number) {
  const piece =
    fieldText.pieces.find((candidate) => offset >= candidate.start && offset <= candidate.start + candidate.length) ??
    fieldText.pieces.find((candidate) => candidate.start >= offset);
  if (piece) document.getSelection()?.collapse(piece.node, Math.max(0, offset - piece.start));
  else document.getSelection()?.collapse(fieldText.field, fieldText.field.childNodes.length);
}
