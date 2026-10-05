// @vitest-environment jsdom
// Spell checking (auto mode) and inline completion on the same composer:
// accepting a suggestion word by word must not trigger an auto-correction.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCompletion } from '../../src/completion/controller';
import type { GhostMeasure } from '../../src/completion/ghost';
import { attachSpellCheck } from '../../src/composer';
import { fakeHighlightEnv, fakeService, textReplace } from '../composer/fakes';

const measure: GhostMeasure = { caretRect: () => new DOMRect(200, 60, 8, 18), contentBox: () => ({ left: 100, right: 500, top: 50, bottom: 110 }) };
const handles: { detach(): void }[] = [];
afterEach(() => {
  handles.splice(0).forEach((h) => h.detach());
  document.body.replaceChildren();
});

describe('completion word accept with auto-correct on', () => {
  it('accepting a lone "." after a correct word leaves the text as inserted', async () => {
    document.body.innerHTML = '<div id="c" contenteditable="true"></div>';
    const el = document.getElementById('c')!;
    el.textContent = 'Your request will be processed within 3 working';
    el.focus();
    document.getSelection()!.collapse(el.firstChild!, el.textContent.length);

    const svc = fakeService({ en: ['seperate'] });
    const spellReplace = vi.fn(textReplace(el));
    const spell = attachSpellCheck(el, {
      service: svc.service,
      mode: 'auto',
      debounceMs: 1,
      env: { highlights: fakeHighlightEnv().env, replace: spellReplace, rectOf: () => new DOMRect(0, 0, 10, 10) },
    });
    const completion = attachCompletion(el, {
      fetcher: async () => ({ completion: ' days .', lang: 'en', latencyMs: 1, model: 'fake', sources: [] }),
      debounceMs: 5,
      env: { replace: textReplace(el), measure, isMac: false },
    });
    handles.push(spell, completion);

    await completion.requestNow();
    const key = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true }));
    key(); // " days"
    key(); // " ."
    // The agent types a space: whatever "." held is now decided.
    const node = el.firstChild as Text;
    node.appendData(' ');
    document.getSelection()!.collapse(node, node.length);
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ' }));
    await spell.settled();
    expect(el.textContent).toBe('Your request will be processed within 3 working days . ');
    expect(spellReplace).not.toHaveBeenCalled();
  });
});
