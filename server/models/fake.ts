import type { CompletionModel } from '../types.ts';

/**
 * Deterministic test double, never a product mode: continues the agent's text
 * from the first approved response in the prompt. Lets the UI and tests run
 * offline without a key (COMPLETION_MODEL=fake).
 */
export function createFakeModel(delayMs = 0): CompletionModel {
  return {
    name: 'fake',
    async complete(_system, user, signal) {
      if (delayMs) await new Promise((r, j) => {
        const t = setTimeout(r, delayMs);
        signal.addEventListener('abort', () => (clearTimeout(t), j(signal.reason)), { once: true });
      });
      const canned = user.match(/^Approved responses:\n- (.+)$/mu)?.[1] ?? '';
      const prefix = user.split('Agent is typing:\n').at(-1) ?? '';
      const lastWord = prefix.trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
      const at = lastWord ? canned.toLowerCase().indexOf(lastWord) : -1;
      return at >= 0 ? canned.slice(at + lastWord.length) : canned;
    },
  };
}
