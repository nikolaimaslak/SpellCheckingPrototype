import type { AssistEvent } from '../composer';
import { DEFAULT_POLICY, parsePolicy, parsePreference, resolveMode, type AdminPolicy, type AgentPreference } from '../policy';

export interface DemoSettings {
  policy: AdminPolicy;
  preference: AgentPreference;
}

const KEY = 'bp-spell-demo-settings';

/** Settings persist per browser; storage may be unavailable (private mode, blocked), so never fail. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): DemoSettings {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? 'null') as { policy?: unknown; preference?: unknown } | null;
    return { policy: parsePolicy(raw?.policy), preference: parsePreference(raw?.preference) };
  } catch {
    return { policy: { ...DEFAULT_POLICY }, preference: {} };
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: DemoSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not persisted; the settings still apply for this page.
  }
}

const MODE_LABEL = { off: 'Off', suggest: 'Suggest only', auto: 'Auto-replace and suggest' } as const;

/** Wires the settings form: fills it, keeps the agent control and effective mode in sync, applies on submit. */
export function mountSettings(form: HTMLFormElement, initial: DemoSettings, onApply: (s: DemoSettings) => void): void {
  const f = form.elements as unknown as {
    mode: HTMLSelectElement;
    lang: RadioNodeList;
    agentMayLower: HTMLInputElement;
    customDictionary: HTMLTextAreaElement;
    agentMode: HTMLSelectElement;
    effective: HTMLOutputElement;
  };
  const langBoxes = [...form.querySelectorAll<HTMLInputElement>('input[name="lang"]')];

  f.mode.value = initial.policy.mode;
  langBoxes.forEach((b) => (b.checked = initial.policy.languages.includes(b.value as 'en' | 'ar')));
  f.agentMayLower.checked = initial.policy.agentMayLower;
  f.customDictionary.value = initial.policy.customDictionary.join('\n');
  f.agentMode.value = initial.preference.mode ?? '';

  const read = (): DemoSettings => ({
    policy: parsePolicy({
      mode: f.mode.value,
      languages: langBoxes.filter((b) => b.checked).map((b) => b.value),
      agentMayLower: f.agentMayLower.checked,
      customDictionary: f.customDictionary.value.split('\n'),
    }),
    preference: parsePreference({ mode: f.agentMode.value }),
  });

  const sync = () => {
    const { policy, preference } = read();
    f.agentMode.disabled = !policy.agentMayLower;
    f.effective.value = `Effective mode: ${MODE_LABEL[resolveMode(policy, preference)]}`;
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onApply(read());
  });
  sync();
}

/** Running counts of assistance events for the session. */
export function mountEventCounter(el: HTMLElement): (event: AssistEvent) => void {
  const counts: Record<AssistEvent['type'], number> = { autocorrect: 0, revert: 0, accept: 0, ignore: 0 };
  const render = () => {
    el.textContent = `Auto-corrected ${counts.autocorrect} · Reverted ${counts.revert} · Accepted ${counts.accept} · Ignored ${counts.ignore}`;
  };
  render();
  return (event) => {
    counts[event.type]++;
    render();
  };
}
