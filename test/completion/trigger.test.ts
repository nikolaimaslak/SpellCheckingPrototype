import { describe, expect, it } from 'vitest';
import { currentSentence, shouldRequest, type TriggerState } from '../../src/completion/trigger';

const base: TriggerState = { before: '', after: '', composing: false, popoverOpen: false, enabled: true };
const go = (over: Partial<TriggerState>) => shouldRequest({ ...base, ...over });

describe('shouldRequest', () => {
  it('needs at least 3 words in the current sentence', () => {
    expect(go({ before: 'Thank you' })).toBe(false);
    expect(go({ before: 'Thank you for' })).toBe(true);
    expect(go({ before: 'Thank you for contacting us, your request' })).toBe(true);
  });

  it('counts words since the last sentence terminator, including ؟ and newlines', () => {
    expect(go({ before: 'Hello there my friend. Your request' })).toBe(false);
    expect(go({ before: 'هل تريد المساعدة؟ تم استلام' })).toBe(false);
    expect(go({ before: 'هل تريد المساعدة؟ تم استلام طلبك' })).toBe(true);
    expect(go({ before: 'one two three\nfour' })).toBe(false);
  });

  it('requires the caret at the end of its line', () => {
    expect(go({ before: 'Thank you for', after: ' contacting' })).toBe(false);
    expect(go({ before: 'Thank you for', after: '  ' })).toBe(true);
  });

  it('is suppressed while composing, with the popover open, or when disabled', () => {
    const ok = { before: 'Thank you for contacting' };
    expect(go({ ...ok, composing: true })).toBe(false);
    expect(go({ ...ok, popoverOpen: true })).toBe(false);
    expect(go({ ...ok, enabled: false })).toBe(false);
  });

  it('extracts the current sentence', () => {
    expect(currentSentence('One. Two three')).toBe(' Two three');
  });
});
