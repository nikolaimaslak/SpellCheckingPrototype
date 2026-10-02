// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { completedWord, type InputLike } from '../../src/autocorrect/trigger';
import { buildTextMap, tokenize } from '../../src/tokenizer';

const ev = (inputType: string, data: string | null = null, isComposing = false): InputLike => ({ inputType, data, isComposing });
const run = (html: string, e: InputLike, caret?: number) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.replaceChildren(div);
  const map = buildTextMap(div);
  const at = caret ?? map.text.length;
  return completedWord(e, map, at, tokenize(map, at))?.text;
};

describe('completedWord', () => {
  it('fires for a typed space after a word', () => {
    expect(run('please seperate ', ev('insertText', ' '))).toBe('seperate');
  });

  it('fires for Arabic punctuation', () => {
    expect(run('كيف حالك؟', ev('insertText', '؟'))).toBe('حالك');
  });

  it('fires for a line break and a new paragraph', () => {
    expect(run('seperate<br>', ev('insertLineBreak'))).toBe('seperate');
    expect(run('<p>seperate</p><p><br></p>', ev('insertParagraph'))).toBe('seperate');
  });

  it('only returns the word immediately before the caret', () => {
    expect(run('seperate this ', ev('insertText', ' '))).toBe('this');
    expect(run('seperate this ', ev('insertText', ' '), 9)).toBe('seperate');
  });

  it('does not fire for paste, multi-character inserts, emoji, undo or IME composition', () => {
    expect(run('please seperate ', ev('insertFromPaste', null))).toBeUndefined();
    expect(run('please seperate ', ev('insertText', 'today? '))).toBeUndefined();
    expect(run('please seperate😊', ev('insertText', '😊'))).toBeUndefined();
    expect(run('please seperate ', ev('historyUndo'))).toBeUndefined();
    expect(run('please seperate ', ev('insertText', ' ', true))).toBeUndefined();
  });

  it('does not fire while the caret is still inside the word', () => {
    expect(run('please seperate', ev('insertText', 'e'))).toBeUndefined();
  });
});
