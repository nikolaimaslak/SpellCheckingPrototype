import type { EditorControl, TextSpan } from '../../assistant';
import { caretRange, replaceText, showHighlight } from './browser';
import { caretOffset, placeCaret, rangeOf, readFieldText } from './field-text';

const SPELL_CHECK_ERROR_HIGHLIGHT = 'bp-spell-check-error';
const AUTO_CORRECTED_HIGHLIGHT = 'bp-auto-corrected';

export function createContentEditableEditorControl(field: HTMLElement): EditorControl {
  const highlight = (name: string, spans: TextSpan[]) => {
    const fieldText = readFieldText(field);
    showHighlight(name, spans.map((span) => rangeOf(fieldText, span.start, span.end)));
  };

  const editorControl: EditorControl = {
    getText: () => readFieldText(field).text,
    getCaret: () => caretOffset(readFieldText(field)),
    setCaret(offset) {
      field.focus();
      placeCaret(readFieldText(field), offset);
    },
    replaceText(start, end, text) {
      const fieldText = readFieldText(field);
      if (start !== end) {
        replaceText(field, rangeOf(fieldText, start, end), text);
        return;
      }
      if (caretOffset(fieldText) !== start) {
        editorControl.setCaret(start);
      }
      const caret = caretRange();
      if (caret) {
        replaceText(field, caret, text);
      }
    },
    showUnderlines: (spans) => highlight(SPELL_CHECK_ERROR_HIGHLIGHT, spans),
    showAutoCorrectedWords: (spans) => highlight(AUTO_CORRECTED_HIGHLIGHT, spans),
  };
  return editorControl;
}
