interface TextPiece {
  node: Text;
  start: number;
  length: number;
}

interface EmptyLine {
  element: Element;
  start: number;
}

export interface FieldText {
  field: HTMLElement;
  text: string;
  pieces: TextPiece[];
  emptyLines: EmptyLine[];
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR', 'TD', 'TH']);
const IMAGE_PLACEHOLDER = '￼';

export function readFieldText(field: HTMLElement): FieldText {
  let text = '';
  const pieces: TextPiece[] = [];
  const emptyLines: EmptyLine[] = [];
  let hasLines = false;
  let isNewLinePending = false;

  const write = (data: string) => {
    if (isNewLinePending) {
      text += '\n';
      isNewLinePending = false;
    }
    text += data;
    hasLines = true;
  };
  const isLastInBlock = (node: Node) => {
    return !node.nextSibling && (node.parentNode === field || BLOCK_TAGS.has((node.parentNode as Element).tagName));
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data;
      if (data) {
        write('');
        pieces.push({
          node: node as Text,
          start: text.length,
          length: data.length,
        });
        text += data;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const tag = (node as Element).tagName;
    if (tag === 'BR') {
      if (!isLastInBlock(node)) {
        write('\n');
      }
      return;
    }
    if (tag === 'IMG') {
      write(IMAGE_PLACEHOLDER);
      return;
    }
    if (!BLOCK_TAGS.has(tag)) {
      node.childNodes.forEach(visit);
      return;
    }
    if (hasLines) {
      isNewLinePending = true;
    }
    const lengthBefore = text.length;
    node.childNodes.forEach(visit);
    if (text.length === lengthBefore) {
      write('');
      emptyLines.push({ element: node as Element, start: text.length });
    }
    isNewLinePending = true;
  };

  field.childNodes.forEach(visit);
  return {
    field,
    text,
    pieces,
    emptyLines,
  };
}

export function caretOffset(fieldText: FieldText): number | undefined {
  const selection = document.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !fieldText.field.contains(selection.anchorNode)) {
    return undefined;
  }
  return offsetOfDomPoint(fieldText, selection.anchorNode, selection.anchorOffset);
}

function offsetOfDomPoint(fieldText: FieldText, node: Node, offsetInNode: number): number {
  const piece = fieldText.pieces.find((candidate) => candidate.node === node);
  if (piece) {
    return piece.start + Math.min(offsetInNode, piece.length);
  }

  const emptyLine = fieldText.emptyLines.find((line) => line.element.contains(node));
  if (emptyLine) {
    return emptyLine.start;
  }
  const point = document.createRange();
  point.setStart(node, offsetInNode);
  const firstPieceAfter = fieldText.pieces.find((candidate) => point.comparePoint(candidate.node, 0) >= 0);
  return firstPieceAfter?.start ?? fieldText.text.length;
}

export function rangeOf(fieldText: FieldText, start: number, end: number): Range {
  const startPiece = fieldText.pieces.find((piece) => start >= piece.start && start < piece.start + piece.length);
  const endPiece = fieldText.pieces.find((piece) => end > piece.start && end <= piece.start + piece.length);
  if (!startPiece || !endPiece) {
    throw new Error(`no text at ${start}-${end}`);
  }
  const range = document.createRange();
  range.setStart(startPiece.node, start - startPiece.start);
  range.setEnd(endPiece.node, end - endPiece.start);
  return range;
}

export function placeCaret(fieldText: FieldText, offset: number) {
  const pieceAtOffset = fieldText.pieces.find((candidate) => offset >= candidate.start && offset <= candidate.start + candidate.length);
  const emptyLine = fieldText.emptyLines.find((line) => line.start === offset);
  if (!pieceAtOffset && emptyLine) {
    document.getSelection()?.collapse(emptyLine.element, 0);
    return;
  }
  const piece = pieceAtOffset ?? fieldText.pieces.find((candidate) => candidate.start >= offset);
  if (piece) {
    document.getSelection()?.collapse(piece.node, Math.max(0, offset - piece.start));
  } else {
    document.getSelection()?.collapse(fieldText.field, fieldText.field.childNodes.length);
  }
}
