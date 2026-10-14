import { describe, expect, it } from 'vitest';
import { appendTurn, parseConversation, SCENARIOS } from '../../src/app/lib/conversation';
import { assistantOptions, DEFAULT_SETTINGS, lines, loadSettings, parseSettings, saveSettings, spellMode } from '../../src/app/lib/settings';
import type { SpellChecker } from '../../src/spell/checker';

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

describe('assistant options', () => {
  it('maps the checkboxes to a spelling mode and splits text fields into lines', () => {
    const checker = {} as SpellChecker;
    const conversation = () => [];
    const log = () => {};
    const { conversation: _c, ...settings } = { ...DEFAULT_SETTINGS, autoCorrect: false, customDictionary: 'GOSI\n\n Absher ', canned: 'a\nb', kb: '' };
    const options = assistantOptions(settings, checker, conversation, log);
    expect(options).toMatchObject({ checker, spelling: 'suggest', customWords: ['GOSI', 'Absher'], canned: ['a', 'b'], kb: [], completion: true, conversation, log });
    expect(assistantOptions({ ...settings, spellCheck: false }, checker, conversation, log).spelling).toBe('off');
  });
});

describe('conversation field', () => {
  it('appends turns as labelled lines and parses them back, oldest first', () => {
    let text = appendTurn('', { role: 'customer', text: 'Hello, my name is Hind.' });
    text = appendTurn(`${text}\n\n`, { role: 'agent', text: 'مرحبا' });
    expect(text).toBe('Customer: Hello, my name is Hind.\nAgent: مرحبا');
    expect(parseConversation(text)).toEqual([
      { role: 'customer', text: 'Hello, my name is Hind.' },
      { role: 'agent', text: 'مرحبا' },
    ]);
  });

  it('reads Arabic labels, joins continuation lines and skips text before the first label', () => {
    const text = 'stray line\nالعميل: متى سيتم معالجة طلبي؟\n  رقم الطلب CS-1042\nالموظف: سيتم ذلك خلال 3 أيام عمل\nagent :  Please wait\nCustomer:';
    expect(parseConversation(text)).toEqual([
      { role: 'customer', text: 'متى سيتم معالجة طلبي؟\nرقم الطلب CS-1042' },
      { role: 'agent', text: 'سيتم ذلك خلال 3 أيام عمل' },
      { role: 'agent', text: 'Please wait' },
    ]);
  });

  it('has an English and an Arabic scenario', () => {
    expect(Object.keys(SCENARIOS)).toEqual(['en-pension', 'ar-pension']);
    expect(parseConversation(appendTurn('', { role: 'customer', text: SCENARIOS['ar-pension'][0] }))[0].role).toBe('customer');
  });
});
