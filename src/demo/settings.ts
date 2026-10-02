import {
  DEFAULT_POLICY,
  parsePolicy,
  parsePreference,
  resolveCompletion,
  resolveMode,
  type AdminPolicy,
  type AgentIdentity,
  type AgentPreference,
} from '../policy';

export interface DemoSettings {
  policy: AdminPolicy;
  preference: AgentPreference;
  agent: AgentIdentity;
}

const KEY = 'bp-spell-demo-settings';
export const DEFAULT_AGENT: AgentIdentity = { user: 'agent.42', team: 'Pensions' };

function parseAgent(input: unknown): AgentIdentity {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d);
  return { user: str(o.user, DEFAULT_AGENT.user), team: str(o.team, DEFAULT_AGENT.team) };
}

/** Settings persist per browser; storage may be unavailable (private mode, blocked), so never fail. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): DemoSettings {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? 'null') as { policy?: unknown; preference?: unknown; agent?: unknown } | null;
    return { policy: parsePolicy(raw?.policy), preference: parsePreference(raw?.preference), agent: parseAgent(raw?.agent) };
  } catch {
    return { policy: parsePolicy(null), preference: {}, agent: { ...DEFAULT_AGENT } };
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
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

/** Wires the settings form: fills it, keeps agent controls and the effective settings in sync, applies on submit. */
export function mountSettings(form: HTMLFormElement, initial: DemoSettings, onApply: (s: DemoSettings) => void): void {
  const field = <T extends Element>(name: string) => form.querySelector<T>(`[name="${name}"]`)!;
  const mode = field<HTMLSelectElement>('mode');
  const langBoxes = [...form.querySelectorAll<HTMLInputElement>('input[name="lang"]')];
  const agentMayLower = field<HTMLInputElement>('agentMayLower');
  const dictionary = field<HTMLTextAreaElement>('customDictionary');
  const completionEnabled = field<HTMLSelectElement>('completionEnabled');
  const teams = field<HTMLInputElement>('completionTeams');
  const users = field<HTMLInputElement>('completionUsers');
  const sourceTranscript = field<HTMLInputElement>('sourceTranscript');
  const sourceCanned = field<HTMLInputElement>('sourceCanned');
  const agentMode = field<HTMLSelectElement>('agentMode');
  const agentCompletion = field<HTMLInputElement>('agentCompletion');
  const agentUser = field<HTMLInputElement>('agentUser');
  const agentTeam = field<HTMLInputElement>('agentTeam');
  const effective = field<HTMLOutputElement>('effective');

  const { policy, preference, agent } = initial;
  mode.value = policy.mode;
  langBoxes.forEach((b) => (b.checked = policy.languages.includes(b.value as 'en' | 'ar')));
  agentMayLower.checked = policy.agentMayLower;
  dictionary.value = policy.customDictionary.join('\n');
  completionEnabled.value = policy.completion.enabled;
  teams.value = policy.completion.teams.join(', ');
  users.value = policy.completion.users.join(', ');
  sourceTranscript.checked = policy.completion.sources.transcript;
  sourceCanned.checked = policy.completion.sources.canned;
  agentMode.value = preference.mode ?? '';
  agentCompletion.checked = preference.completion !== false;
  agentUser.value = agent.user;
  agentTeam.value = agent.team;

  const read = (): DemoSettings => ({
    policy: parsePolicy({
      mode: mode.value,
      languages: langBoxes.filter((b) => b.checked).map((b) => b.value),
      agentMayLower: agentMayLower.checked,
      customDictionary: dictionary.value.split('\n'),
      completion: {
        enabled: completionEnabled.value,
        teams: list(teams.value),
        users: list(users.value),
        sources: { transcript: sourceTranscript.checked, canned: sourceCanned.checked },
      },
    }),
    preference: parsePreference({ mode: agentMode.value, ...(agentCompletion.checked ? {} : { completion: false }) }),
    agent: parseAgent({ user: agentUser.value, team: agentTeam.value }),
  });

  const sync = () => {
    const s = read();
    agentMode.disabled = !s.policy.agentMayLower;
    agentCompletion.disabled = !s.policy.agentMayLower;
    const completion = resolveCompletion(s.policy, s.preference, s.agent) ? 'on' : 'off';
    effective.value = `Effective: ${MODE_LABEL[resolveMode(s.policy, s.preference)]} · completion ${completion}`;
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onApply(read());
  });
  sync();
}

const COUNTED = ['autocorrect', 'revert', 'accept', 'ignore', 'completion-shown', 'completion-accepted'] as const;

/** Running counts of assistance events for the session. */
export function mountEventCounter(el: HTMLElement): (event: { type: string }) => void {
  const counts = Object.fromEntries(COUNTED.map((t) => [t, 0])) as Record<(typeof COUNTED)[number], number>;
  const render = () => {
    el.textContent =
      `Auto-corrected ${counts.autocorrect} · Reverted ${counts.revert} · Accepted ${counts.accept} · Ignored ${counts.ignore}` +
      ` · Completions ${counts['completion-accepted']}/${counts['completion-shown']}`;
  };
  render();
  return (event) => {
    if (event.type in counts) counts[event.type as (typeof COUNTED)[number]]++;
    render();
  };
}

export { DEFAULT_POLICY };
