// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POLICY, parsePolicy } from '../../src/policy';
import { DEFAULT_AGENT, loadSettings, mountEventCounter, mountSettings, saveSettings, type DemoSettings } from '../../src/demo/settings';

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
    expect(effective()).toBe('Effective: Auto-replace and suggest · completion off');
  });

  it('follows resolveMode as the agent changes the preference', () => {
    mountSettings(form, settings({ policy: { ...DEFAULT_POLICY, mode: 'auto' } }), () => {});
    field<HTMLSelectElement>('agentMode').value = 'suggest';
    change(field('agentMode'));
    expect(effective()).toBe('Effective: Suggest only · completion off');
  });

  it('flips completion when the current agent moves off a listed team', () => {
    const policy = parsePolicy({ completion: { enabled: 'listed', teams: ['Pensions'] } });
    mountSettings(form, settings({ policy }), () => {});
    expect(effective()).toMatch(/completion on$/);
    field<HTMLInputElement>('agentTeam').value = 'Registration';
    change(field('agentTeam'));
    expect(effective()).toMatch(/completion off$/);
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
    field<HTMLInputElement>('agentCompletion').checked = false;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onApply).toHaveBeenCalledWith({
      policy: {
        mode: 'auto',
        languages: ['ar'],
        agentMayLower: true,
        customDictionary: ['GOSI', 'التأمينات'],
        completion: { enabled: 'listed', teams: ['Pensions', 'Registration'], users: [], sources: { transcript: true, canned: false } },
      },
      preference: { completion: false },
      agent: DEFAULT_AGENT,
    });
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
    expect(el.textContent).toBe('Auto-corrected 1 · Reverted 1 · Accepted 0 · Ignored 0 · Completions 1/2');
  });
});
