import type { CompletionModel } from '../types.ts';

// Deterministic "grammar fixes" for offline polish tests and UI checks.
const POLISH_FIXES: [RegExp, string][] = [
  [/\bHe go\b/g, 'He went'],
  [/\bbuyed\b/g, 'bought'],
  [/\bI has\b/g, 'I have'],
  [/\brecieve/g, 'receive'],
  [/هذه الطلب/g, 'هذا الطلب'],
  [/الموظفين الجديد\b/g, 'الموظفين الجدد'],
];

const WORD = /[\p{L}\p{N}\p{M}]/u;

/** Index of `fragment` at the start of a word of `text`, ignoring case; -1 if absent. */
function wordStart(text: string, fragment: string): number {
  const lower = text.toLowerCase();
  const f = fragment.toLowerCase();
  for (let i = lower.indexOf(f); i >= 0; i = lower.indexOf(f, i + 1)) if (i === 0 || !WORD.test(text[i - 1])) return i;
  return -1;
}

/**
 * The structured answer `{ word, rest }`: continues the prefix from `text`
 * where its unfinished word (or, after a space or punctuation, its last word)
 * appears. Unmatched, the unfinished word is taken as finished.
 */
function structured(prefix: string, text: string): string {
  const typed = prefix.match(/[\p{L}\p{N}\p{M}]+$/u)?.[0] ?? '';
  const anchor = typed || (prefix.match(/[\p{L}\p{N}\p{M}]+/gu)?.at(-1) ?? '');
  const at = anchor ? wordStart(text, anchor) : -1;
  let end = at + anchor.length;
  while (at >= 0 && end < text.length && WORD.test(text[end])) end++;
  if (typed) return JSON.stringify(at >= 0 ? { word: text.slice(at, end), rest: text.slice(end) } : { word: typed, rest: text && ` ${text}` });
  const rest = at >= 0 ? text.slice(end) : text;
  return JSON.stringify({ word: '', rest: /\s$/u.test(prefix) ? rest.trimStart() : rest });
}

/**
 * Deterministic test double, never a product mode: continues the agent's text
 * from the first approved response in the prompt, as `{ word, rest }` JSON
 * (polish gets its fixes as plain text). Lets the UI and tests run offline without a key
 * (COMPLETION_MODEL=fake).
 */
export function createFakeModel(delayMs = 0): CompletionModel {
  return {
    name: 'fake',
    async complete(system, user, signal) {
      if (delayMs) await new Promise((r, j) => {
        const t = setTimeout(r, delayMs);
        signal.addEventListener('abort', () => (clearTimeout(t), j(signal.reason)), { once: true });
      });
      if (system.startsWith('You correct grammar')) return POLISH_FIXES.reduce((t, [re, fix]) => t.replace(re, fix), user);
      const canned = user.match(/^Approved responses:\n- (.+)$/mu)?.[1] ?? user.match(/^Knowledge base:\n- [^:]+: (.+)$/mu)?.[1] ?? '';
      const prefix = user.split('Agent is typing:\n').at(-1) ?? '';
      return structured(prefix, canned);
    },
  };
}
