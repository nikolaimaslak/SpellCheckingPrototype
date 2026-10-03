// Compiles hand-marked sources (eval/datasets/src/*.txt) into labelled JSONL
// datasets. Markup, independent of the tokenizer's own patterns:
//   ⟦span⟧         gold excluded (never checked or changed)
//   ⟨typo→word⟩    gold misspelled: `typo` as typed, `word` intended
// Lines starting with # and blank lines are skipped. Message ids are
// `<name>-<line number>`, so they stay stable when lines are appended.
import type { Label, Message } from './types.ts';

const MARK = /⟦([^⟧]+)⟧|⟨([^→⟩]+)→([^⟩]+)⟩/gu;

export function compileSource(name: string, source: string): Message[] {
  const messages: Message[] = [];
  source.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    let text = '';
    let last = 0;
    const labels: Label[] = [];
    for (const m of line.matchAll(MARK)) {
      text += line.slice(last, m.index);
      if (m[1] !== undefined) {
        labels.push({ start: text.length, word: m[1], gold: 'excluded' });
        text += m[1];
      } else {
        labels.push({ start: text.length, word: m[2], gold: 'misspelled', intended: m[3] });
        text += m[2];
      }
      last = m.index + m[0].length;
    }
    text += line.slice(last);
    if (/[⟦⟧⟨⟩]/u.test(text)) throw new Error(`${name} line ${i + 1}: unbalanced marker`);
    messages.push(labels.length ? { id: `${name}-${i + 1}`, text, labels } : { id: `${name}-${i + 1}`, text });
  });
  return messages;
}
