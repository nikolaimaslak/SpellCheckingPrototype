// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POLICY } from '../../src/policy';
import { loadSettings, mountEventCounter, mountSettings, saveSettings, type DemoSettings } from '../../src/demo/settings';

// The real form markup from index.html.
const formHtml = readFileSync('index.html', 'utf8').match(/<form id="assist-settings"[\s\S]*?<\/form>/)![0];
let form: HTMLFormElement;
const field = <T extends Element>(sel: string) => form.querySelector<T>(sel)!;
const effective = () => field<HTMLOutputElement>('output[name="effective"]').value;

beforeEach(() => {
  document.body.innerHTML = formHtml;
  form = document.getElementById('assist-settings') as HTMLFormElement;
});

describe('settings panel', () => {
  it('locks the agent preference when agent choice is not allowed, and shows the admin mode', () => {
    mountSettings(form, { policy: { ...DEFAULT_POLICY, mode: 'auto', agentMayLower: false }, preference: { mode: 'off' } }, () => {});
    expect(field<HTMLSelectElement>('select[name="agentMode"]').disabled).toBe(true);
    expect(effective()).toBe('Effective mode: Auto-replace and suggest');
  });

  it('follows resolveMode as the agent changes the preference', () => {
    mountSettings(form, { policy: { ...DEFAULT_POLICY, mode: 'auto' }, preference: {} }, () => {});
    const pref = field<HTMLSelectElement>('select[name="agentMode"]');
    expect(pref.disabled).toBe(false);
    pref.value = 'suggest';
    pref.dispatchEvent(new Event('change', { bubbles: true }));
    expect(effective()).toBe('Effective mode: Suggest only');
  });

  it('applies the edited policy on submit', () => {
    const onApply = vi.fn();
    mountSettings(form, { policy: { ...DEFAULT_POLICY }, preference: {} }, onApply);
    field<HTMLSelectElement>('select[name="mode"]').value = 'auto';
    field<HTMLInputElement>('input[name="lang"][value="en"]').checked = false;
    field<HTMLTextAreaElement>('textarea[name="customDictionary"]').value = 'GOSI\n\n التأمينات \nGOSI';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onApply).toHaveBeenCalledWith({
      policy: { mode: 'auto', languages: ['ar'], agentMayLower: true, customDictionary: ['GOSI', 'التأمينات'] },
      preference: {},
    });
  });
});

describe('settings storage', () => {
  const settings: DemoSettings = {
    policy: { mode: 'auto', languages: ['en'], agentMayLower: false, customDictionary: ['Absher'] },
    preference: { mode: 'suggest' },
  };

  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('survives storage that throws, or holds garbage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => saveSettings(throwing, settings)).not.toThrow();
    expect(loadSettings(throwing)).toEqual({ policy: DEFAULT_POLICY, preference: {} });
    expect(loadSettings({ getItem: () => '{not json' })).toEqual({ policy: DEFAULT_POLICY, preference: {} });
    expect(loadSettings(undefined)).toEqual({ policy: DEFAULT_POLICY, preference: {} });
  });
});

describe('event counter', () => {
  it('counts events by type', () => {
    const el = document.createElement('span');
    const record = mountEventCounter(el);
    expect(el.textContent).toBe('Auto-corrected 0 · Reverted 0 · Accepted 0 · Ignored 0');
    record({ type: 'autocorrect', lang: 'en', original: 'seperate', replacement: 'separate' });
    record({ type: 'revert', lang: 'en', original: 'seperate', replacement: 'separate' });
    record({ type: 'accept', lang: 'ar', original: 'اذا', replacement: 'إذا' });
    expect(el.textContent).toBe('Auto-corrected 1 · Reverted 1 · Accepted 1 · Ignored 0');
  });
});
