// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POLICY, parsePolicy } from '../../src/policy';
import { clearSettings, DEFAULT_AGENT, loadSettings, mountEventCounter, mountSettings, saveSettings, type DemoSettings } from '../../src/demo/settings';

// The real form markup from index.html.
const formHtml = readFileSync('index.html', 'utf8').match(/<form id="assist-settings"[\s\S]*?<\/form>/)![0];
let form: HTMLFormElement;
const field = <T extends Element>(name: string) => form.querySelector<T>(`[name="${name}"]`)!;
const effective = () => field<HTMLOutputElement>('effective').value;
const settings = (over: Partial<DemoSettings> = {}): DemoSettings => ({ policy: { ...DEFAULT_POLICY }, preference: {}, agent: { ...DEFAULT_AGENT }, ...over });
const change = (el: Element) => el.dispatchEvent(new Event('change', { bubbles: true }));

beforeEach(() => {
  document.body.innerHTML = formHtml;
  form = document.getElementById('assist-settings') as HTMLFormElement;
});

describe('settings panel', () => {
  it('locks the agent controls when agent choice is not allowed, and shows the admin settings', () => {
    mountSettings(form, settings({ policy: { ...DEFAULT_POLICY, mode: 'auto', agentMayLower: false }, preference: { mode: 'off', completion: false } }), () => {});
    expect(field<HTMLSelectElement>('agentMode').disabled).toBe(true);
    expect(field<HTMLInputElement>('agentCompletion').disabled).toBe(true);
    expect(effective()).toBe('Effective: Auto-replace and suggest · completion off · polish off');
  });

  it('follows resolveMode as the agent changes the preference', () => {
    mountSettings(form, settings({ policy: { ...DEFAULT_POLICY, mode: 'auto' } }), () => {});
    field<HTMLSelectElement>('agentMode').value = 'suggest';
    change(field('agentMode'));
    expect(effective()).toBe('Effective: Suggest only · completion off · polish off');
  });

  it('flips completion when the current agent moves off a listed team', () => {
    const policy = parsePolicy({ completion: { enabled: 'listed', teams: ['Pensions'] } });
    mountSettings(form, settings({ policy }), () => {});
    expect(effective()).toMatch(/completion on ·/);
    field<HTMLInputElement>('agentTeam').value = 'Registration';
    change(field('agentTeam'));
    expect(effective()).toMatch(/completion off ·/);
  });

  it('shows polish on for everyone, and honors the agent opt-out only when allowed', () => {
    mountSettings(form, settings({ policy: parsePolicy({ grammar: { enabled: 'all' } }) }), () => {});
    expect(effective()).toMatch(/polish on$/);
    field<HTMLInputElement>('agentGrammar').checked = false;
    change(field('agentGrammar'));
    expect(effective()).toMatch(/polish off$/);
    field<HTMLInputElement>('agentMayLower').checked = false;
    change(field('agentMayLower'));
    expect(field<HTMLInputElement>('agentGrammar').disabled).toBe(true);
    expect(effective()).toMatch(/polish on$/);
  });

  it('applies the edited settings on submit', () => {
    const onApply = vi.fn();
    mountSettings(form, settings(), onApply);
    field<HTMLSelectElement>('mode').value = 'auto';
    form.querySelector<HTMLInputElement>('input[name="lang"][value="en"]')!.checked = false;
    field<HTMLTextAreaElement>('customDictionary').value = 'GOSI\n\n التأمينات \nGOSI';
    field<HTMLSelectElement>('completionEnabled').value = 'listed';
    field<HTMLInputElement>('completionTeams').value = 'Pensions, Registration ,';
    field<HTMLInputElement>('sourceCanned').checked = false;
    field<HTMLInputElement>('sourceKb').checked = false;
    field<HTMLInputElement>('agentCompletion').checked = false;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onApply).toHaveBeenCalledWith({
      policy: {
        mode: 'auto',
        autoReplace: 'list-and-rule',
        languages: ['ar'],
        agentMayLower: true,
        customDictionary: ['GOSI', 'التأمينات'],
        completion: { enabled: 'listed', teams: ['Pensions', 'Registration'], users: [], sources: { transcript: true, canned: false, kb: false } },
        grammar: { enabled: 'off', teams: [], users: [] },
      },
      preference: { completion: false },
      agent: DEFAULT_AGENT,
    });
  });
});

describe('auto-replace confidence', () => {
  it('reflects the stored policy, applies a change and names the level', () => {
    const onApply = vi.fn();
    mountSettings(form, settings({ policy: { ...DEFAULT_POLICY, mode: 'auto', autoReplace: 'list' } }), onApply);
    expect(field<HTMLSelectElement>('autoReplace').value).toBe('list');
    expect(effective()).toBe('Effective: Auto-replace known misspellings and suggest · completion off · polish off');
    field<HTMLSelectElement>('autoReplace').value = 'list-and-rule';
    change(field('autoReplace'));
    expect(effective()).toBe('Effective: Auto-replace and suggest · completion off · polish off');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onApply.mock.calls[0][0].policy.autoReplace).toBe('list-and-rule');
  });

  it('persists across a reload', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveSettings(storage, settings({ policy: { ...DEFAULT_POLICY, autoReplace: 'list' } }));
    expect(loadSettings(storage).policy.autoReplace).toBe('list');
  });
});

describe('presets and reset', () => {
  const click = (sel: string) => form.querySelector<HTMLElement>(sel)!.click();

  it('"Everything on" turns on auto-correct, completion and polish and applies', () => {
    const onApply = vi.fn();
    mountSettings(form, settings({ preference: { completion: false, grammar: false } }), onApply);
    click('[data-preset="all"]');
    expect(effective()).toBe('Effective: Auto-replace and suggest · completion on · polish on');
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as DemoSettings;
    expect(applied.policy.completion.sources).toEqual({ transcript: true, canned: true, kb: true });
    expect(applied.preference).toEqual({});
  });

  it('"Spell check only" and "Auto-correct" set the mode and switch the model features off', () => {
    const onApply = vi.fn();
    mountSettings(form, settings({ policy: parsePolicy({ mode: 'auto', completion: { enabled: 'all' }, grammar: { enabled: 'all' } }) }), onApply);
    click('[data-preset="spell"]');
    expect(effective()).toBe('Effective: Suggest only · completion off · polish off');
    field<HTMLSelectElement>('autoReplace').value = 'list';
    click('[data-preset="autocorrect"]');
    expect(effective()).toBe('Effective: Auto-replace and suggest · completion off · polish off');
    expect(field<HTMLSelectElement>('autoReplace').value).toBe('list-and-rule');
  });

  it('reset clears storage and restores the defaults', () => {
    const store = new Map<string, string>([['bp-spell-demo-settings', '{"policy":{"mode":"auto","autoReplace":"list"}}']]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const onApply = vi.fn((s: DemoSettings) => saveSettings(storage, s));
    mountSettings(form, loadSettings(storage), onApply, () => clearSettings(storage));
    expect(effective()).toMatch(/^Effective: Auto-replace known misspellings/);
    click('[data-reset]');
    expect(effective()).toBe('Effective: Suggest only · completion off · polish off');
    expect(field<HTMLSelectElement>('autoReplace').value).toBe('list-and-rule');
    expect(loadSettings(storage)).toEqual({ policy: DEFAULT_POLICY, preference: {}, agent: DEFAULT_AGENT });
  });
});

describe('settings storage', () => {
  const s: DemoSettings = {
    policy: parsePolicy({ mode: 'auto', languages: ['en'], agentMayLower: false, customDictionary: ['Absher'], completion: { enabled: 'all' } }),
    preference: { mode: 'suggest' },
    agent: { user: 'agent.7', team: 'Registration' },
  };

  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveSettings(storage, s);
    expect(loadSettings(storage)).toEqual(s);
  });

  it('loads stored Phase 3 settings (no grammar, no kb source)', () => {
    const phase3 = JSON.stringify({ policy: { mode: 'suggest', completion: { enabled: 'all', sources: { transcript: true, canned: true } } }, preference: {}, agent: { user: 'a', team: 'b' } });
    const loaded = loadSettings({ getItem: () => phase3 });
    expect(loaded.policy.grammar.enabled).toBe('off');
    expect(loaded.policy.completion.sources.kb).toBe(true);
  });

  it('loads stored Phase 2 settings (no completion, no agent)', () => {
    const phase2 = JSON.stringify({ policy: { mode: 'auto', languages: ['en'], agentMayLower: true, customDictionary: [] }, preference: {} });
    const loaded = loadSettings({ getItem: () => phase2 });
    expect(loaded.policy.mode).toBe('auto');
    expect(loaded.policy.completion).toEqual(DEFAULT_POLICY.completion);
    expect(loaded.agent).toEqual(DEFAULT_AGENT);
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
    const defaults = { policy: DEFAULT_POLICY, preference: {}, agent: DEFAULT_AGENT };
    expect(() => saveSettings(throwing, s)).not.toThrow();
    expect(loadSettings(throwing)).toEqual(defaults);
    expect(loadSettings({ getItem: () => '{not json' })).toEqual(defaults);
    expect(loadSettings(undefined)).toEqual(defaults);
  });
});

describe('event counter', () => {
  it('counts spelling and completion events', () => {
    const el = document.createElement('span');
    const record = mountEventCounter(el);
    record({ type: 'autocorrect' });
    record({ type: 'revert' });
    record({ type: 'completion-shown' });
    record({ type: 'completion-shown' });
    record({ type: 'completion-accepted' });
    expect(el.textContent).toBe('Auto-corrected 1 · Reverted 1 · Accepted 0 · Ignored 0 · Completions 1/2 · Polish 0/0');
  });
});
