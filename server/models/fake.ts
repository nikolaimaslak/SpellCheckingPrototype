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

/**
 * Deterministic test double, never a product mode: continues the agent's text
 * from the first approved response in the prompt. Lets the UI and tests run
 * offline without a key (COMPLETION_MODEL=fake).
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
      const lastWord = prefix.trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
      const at = lastWord ? canned.toLowerCase().indexOf(lastWord) : -1;
      return at >= 0 ? canned.slice(at + lastWord.length) : canned;
    },
  };
}
