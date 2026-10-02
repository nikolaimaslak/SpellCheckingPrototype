import { describe, expect, it } from 'vitest';
import { diff } from '../../src/polish/diff';

const apply = (draft: string, hunks: { start: number; end: number; text: string }[]) =>
  [...hunks].sort((x, y) => y.start - x.start).reduce((t, h) => t.slice(0, h.start) + h.text + t.slice(h.end), draft);

describe('polish diff', () => {
  it('finds word replacements with draft offsets', () => {
    const draft = 'He go to the office yesterday and buyed a pen.';
    const { hunks, segments } = diff(draft, 'He went to the office yesterday and bought a pen.');
    expect(hunks).toEqual([
      { start: 3, end: 5, text: 'went' },
      { start: 34, end: 39, text: 'bought' },
    ]);
    expect(segments.filter((s) => s.type !== 'eq')).toEqual([
      { type: 'del', text: 'go' },
      { type: 'ins', text: 'went' },
      { type: 'del', text: 'buyed' },
      { type: 'ins', text: 'bought' },
    ]);
  });

  it('handles pure insertions and deletions', () => {
    const ins = diff('I have question.', 'I have a question.');
    expect(apply('I have question.', ins.hunks)).toBe('I have a question.');
    const del = diff('This is is wrong.', 'This is wrong.');
    expect(apply('This is is wrong.', del.hunks)).toBe('This is wrong.');
  });

  it('keeps Arabic marks inside words and replaces whole words', () => {
    const draft = 'تم استلام هذه الطلب وسيتم مُعالجته.';
    const { hunks } = diff(draft, 'تم استلام هذا الطلب وسيتم مُعالجته.');
    expect(hunks).toEqual([{ start: 10, end: 13, text: 'هذا' }]);
    expect(apply(draft, hunks)).toBe('تم استلام هذا الطلب وسيتم مُعالجته.');
  });

  it('handles punctuation-only changes', () => {
    const { hunks } = diff('Hello how are you', 'Hello, how are you?');
    expect(apply('Hello how are you', hunks)).toBe('Hello, how are you?');
  });

  it('drops hunks touching a line break', () => {
    const { hunks } = diff('Hello\nworld', 'Hello world');
    expect(hunks).toEqual([]);
  });

  it('round-trips arbitrary edits', () => {
    const draft = 'Dear customer, we has recieved your request and it will processed soon.';
    const polished = 'Dear customer, we have received your request, and it will be processed soon.';
    expect(apply(draft, diff(draft, polished).hunks)).toBe(polished);
  });
});
