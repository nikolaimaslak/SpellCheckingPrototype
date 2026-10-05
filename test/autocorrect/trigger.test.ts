// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boundaryKind, completedWord, releasable, type InputLike } from '../../src/autocorrect/trigger';
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

describe('boundaryKind', () => {
  it('holds on characters that occur inside addresses', () => {
    for (const c of ['.', '@', ':', '/']) expect(boundaryKind(ev('insertText', c)), c).toBe('hold');
  });

  it('decides at once on other punctuation, including Arabic', () => {
    for (const c of [',', '!', '?', ';', '؟', '،', '؛', ')']) expect(boundaryKind(ev('insertText', c)), c).toBe('decide');
  });

  it('releases on whitespace, a line break and a new paragraph', () => {
    expect(boundaryKind(ev('insertText', ' '))).toBe('release');
    expect(boundaryKind(ev('insertText', '\u00a0'))).toBe('release');
    expect(boundaryKind(ev('insertLineBreak'))).toBe('release');
    expect(boundaryKind(ev('insertParagraph'))).toBe('release');
  });

  it('is none for anything that is not a typed boundary', () => {
    expect(boundaryKind(ev('insertFromPaste'))).toBe('none');
    expect(boundaryKind(ev('insertText', '. '))).toBe('none');
    expect(boundaryKind(ev('insertText', 'e'))).toBe('none');
    expect(boundaryKind(ev('insertText', '.', true))).toBe('none');
    expect(boundaryKind(ev('historyUndo'))).toBe('none');
  });
});

describe('releasable', () => {
  const tokensOf = (text: string) => {
    const div = document.createElement('div');
    div.textContent = text;
    document.body.replaceChildren(div);
    return tokenize(buildTextMap(div));
  };
  const release = (text: string, held: { start: number; text: string }[]) =>
    releasable(held, text, text.length, tokensOf(text)).map((t) => t.text);

  it('keeps a held word of the same run', () => {
    expect(release('please seperate. ', [{ start: 7, text: 'seperate' }])).toEqual(['seperate']);
    expect(release('رقم المستخذم. ', [{ start: 4, text: 'المستخذم' }])).toEqual(['المستخذم']);
  });

  it('drops words that ended up inside an email address or URL', () => {
    const text = 'email info@gosi.gov.sa ';
    expect(release(text, [{ start: 6, text: 'info' }, { start: 11, text: 'gosi' }, { start: 16, text: 'gov' }])).toEqual([]);
    expect(release('visit https://www.gosi.gov.sa/en ', [{ start: 6, text: 'https' }])).toEqual([]);
    expect(release('راسلنا على info@gosi.gov.sa ', [{ start: 16, text: 'gosi' }])).toEqual([]);
  });

  it('drops a word that changed or lies in another run', () => {
    expect(release('please separte. ', [{ start: 7, text: 'seperate' }])).toEqual([]);
    // Whitespace typed at the start of the message: "seperate." is not the run before it.
    expect(releasable([{ start: 8, text: 'seperate' }], ' please seperate.', 1, tokensOf(' please seperate.'))).toEqual([]);
  });
});
