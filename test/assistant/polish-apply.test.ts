// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { applyPolish, revertSpans, type AppliedSpan, type ApplyResult } from '../../src/assistant/polish-apply';

const spansOf = (r: ApplyResult): AppliedSpan[] => (r.ok ? r.spans : []);
import { diff } from '../../src/assistant/polish-diff';

/** Stand-in for execCommand('insertText'): replaces the range's text in place (start node keeps formatting). */
function textReplace() {
  return vi.fn((range: Range, text: string) => {
    if (range.startContainer === range.endContainer) {
      (range.startContainer as Text).replaceData(range.startOffset, range.endOffset - range.startOffset, text);
      return;
    }
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
  });
}

const composer = (html: string) => {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
};

describe('applying a polish', () => {
  it('applies all changes inside one text run with a single replace', () => {
    const el = composer('He go to the office yesterday and buyed a pen.');
    const draft = el.textContent!;
    const replace = textReplace();
    const res = applyPolish(el, draft, diff(draft, 'He went to the office yesterday and bought a pen.').hunks, replace);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: true, mode: 'single' });
    expect(el.textContent).toBe('He went to the office yesterday and bought a pen.');
  });

  it('applies changes across bold separately, last to first, keeping the bold; revert restores them', () => {
    const el = composer('He go to <b>the office</b> yesterday and buyed a pen.');
    const draft = el.textContent!;
    const replace = textReplace();
    const res = applyPolish(el, draft, diff(draft, 'He went to the office yesterday and bought a pen.').hunks, replace);
    expect(res).toMatchObject({ ok: true, mode: 'per-span' });
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[0][1]).toBe('bought'); // last first
    expect(el.innerHTML).toBe('He went to <b>the office</b> yesterday and bought a pen.');
    expect(revertSpans(spansOf(res), replace)).toBe(2);
    expect(el.innerHTML).toBe('He go to <b>the office</b> yesterday and buyed a pen.');
  });

  it('refuses when the draft changed after polishing was requested', () => {
    const el = composer('He go home.');
    const replace = textReplace();
    const res = applyPolish(el, 'He go home now.', diff('He go home now.', 'He went home now.').hunks, replace);
    expect(res).toEqual({ ok: false, reason: 'stale' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('handles a pure insertion', () => {
    const el = composer('I have question.');
    const replace = textReplace();
    applyPolish(el, 'I have question.', diff('I have question.', 'I have a question.').hunks, replace);
    expect(el.textContent).toBe('I have a question.');
  });

  it('skips reverting a span the agent edited since', () => {
    const el = composer('He go to <b>the office</b> and buyed a pen.');
    const draft = el.textContent!;
    const replace = textReplace();
    const res = applyPolish(el, draft, diff(draft, 'He went to the office and bought a pen.').hunks, replace);
    (el.firstChild as Text).replaceData(3, 4, 'goes'); // agent edits "went"
    expect(revertSpans(spansOf(res), replace)).toBe(1);
    expect(el.textContent).toBe('He goes to the office and buyed a pen.');
  });
});
