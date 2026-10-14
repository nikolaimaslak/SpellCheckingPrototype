import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, lines, loadSettings, parseSettings, saveSettings, spellMode } from '../../src/app/lib/settings';

const memory = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
};

describe('React demo settings', () => {
  it('falls back to the defaults field by field', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings({ autoCorrect: false, autoReplace: 'bogus', languages: ['ar', 'fr'], kb: 42 });
    expect(s.autoCorrect).toBe(false);
    expect(s.autoReplace).toBe(DEFAULT_SETTINGS.autoReplace);
    expect(s.languages).toEqual(['ar']);
    expect(s.kb).toBe(DEFAULT_SETTINGS.kb);
  });

  it('round-trips through storage, and survives broken storage', () => {
    const storage = memory();
    saveSettings({ ...DEFAULT_SETTINGS, customDictionary: 'Foo' }, storage);
    expect(loadSettings(storage).customDictionary).toBe('Foo');
    storage.setItem('bp-spell-react-demo-settings', '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('maps the two spelling checkboxes to a mode', () => {
    expect(spellMode({ ...DEFAULT_SETTINGS, spellCheck: false, autoCorrect: true })).toBe('off');
    expect(spellMode({ ...DEFAULT_SETTINGS, spellCheck: true, autoCorrect: false })).toBe('suggest');
    expect(spellMode({ ...DEFAULT_SETTINGS, spellCheck: true, autoCorrect: true })).toBe('auto');
  });

  it('splits text fields into non-empty lines', () => {
    expect(lines(' a \n\n b\n')).toEqual(['a', 'b']);
  });
});

describe('React demo conversation field', async () => {
  const { appendTurn, parseConversation } = await import('../../src/app/lib/conversation');

  it('appends turns as labelled lines and parses them back, oldest first', () => {
    let text = appendTurn('', { role: 'customer', text: 'Hello, my name is Hind.' });
    text = appendTurn(`${text}\n\n`, { role: 'agent', text: 'مرحبا' });
    expect(text).toBe('Customer: Hello, my name is Hind.\nAgent: مرحبا');
    expect(parseConversation(text)).toEqual([
      { role: 'customer', text: 'Hello, my name is Hind.' },
      { role: 'agent', text: 'مرحبا' },
    ]);
  });
});
