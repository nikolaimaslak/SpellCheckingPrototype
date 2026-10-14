// @vitest-environment jsdom
// Auto-correct and inline completion on the same field: accepting a
// suggestion word by word must not trigger an auto-correction.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '../../src/assistant';
import { fakeChecker, testAssistant, textReplace } from './fakes';

const assistants: Assistant[] = [];
afterEach(() => {
  assistants.splice(0).forEach((a) => a.detach());
  document.body.replaceChildren();
});

describe('completion word accept with auto-correct on', () => {
  it('accepting a lone "." after a correct word leaves the text as inserted', async () => {
    document.body.innerHTML = '<div id="c" contenteditable="true"></div>';
    const el = document.getElementById('c')!;
    el.textContent = 'Your request will be processed within 3 working';
    el.focus();
    document.getSelection()!.collapse(el.firstChild!, el.textContent.length);

    const replace = vi.fn(textReplace(el));
    const { assistant } = testAssistant(el, {
      checker: fakeChecker({ en: ['seperate'] }).checker,
      spelling: 'auto',
      completion: true,
      server: { complete: async () => ({ completion: ' days .', lang: 'en', latencyMs: 1, model: 'fake', sources: [] }), polish: async () => null },
      env: { replace },
    });
    assistants.push(assistant);

    await assistant.completion!.requestNow();
    const key = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true }));
    key(); // " days"
    key(); // " ."
    // The agent types a space: whatever "." held is now decided.
    const node = el.firstChild as Text;
    node.appendData(' ');
    document.getSelection()!.collapse(node, node.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    await assistant.spelling!.settled();
    expect(el.textContent).toBe('Your request will be processed within 3 working days . ');
    // Only the two word accepts went through replace: no auto-correction.
    expect(replace.mock.calls.map((c) => c[1])).toEqual([' days', ' .']);
  });
});
