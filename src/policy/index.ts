import type { Lang } from '../spell/protocol';

export type AssistMode = 'off' | 'suggest' | 'auto';

/** Tenant-wide settings an administrator controls (stand-in for Contact Center Administrator). */
export interface AdminPolicy {
  mode: AssistMode;
  languages: Lang[];
  /** Agents may pick a less aggressive mode than the admin's (never a more aggressive one). */
  agentMayLower: boolean;
  /** Product names, GOSI terminology, transliterations: never flagged or corrected. */
  customDictionary: string[];
  completion: CompletionPolicy;
}

/** Inline completion sends text to a hosted model, so it is opt-in per tenant, team or user. */
export interface CompletionPolicy {
  enabled: 'off' | 'all' | 'listed';
  teams: string[];
  users: string[];
  sources: { transcript: boolean; canned: boolean };
}

export interface AgentPreference {
  mode?: AssistMode;
  /** false turns completion off for this agent (only honored when the admin allows agent choice). */
  completion?: boolean;
}

export interface AgentIdentity {
  user: string;
  team: string;
}

/** Auto-correct must be an explicit admin choice, so the default only suggests. */
export const DEFAULT_POLICY: AdminPolicy = {
  mode: 'suggest',
  languages: ['en', 'ar'],
  agentMayLower: true,
  customDictionary: [],
  completion: { enabled: 'off', teams: [], users: [], sources: { transcript: true, canned: true } },
};

const RANK: Record<AssistMode, number> = { off: 0, suggest: 1, auto: 2 };
const MODES = Object.keys(RANK) as AssistMode[];
const LANGS: Lang[] = ['en', 'ar'];

/** The admin mode, unless the admin allows agent choice and the agent picked a less aggressive one. */
export function resolveMode(policy: AdminPolicy, pref: AgentPreference = {}): AssistMode {
  if (policy.agentMayLower && pref.mode && RANK[pref.mode] < RANK[policy.mode]) return pref.mode;
  return policy.mode;
}

/** Completion is effective if the admin enables it for this agent and the agent (when allowed) hasn't opted out. */
export function resolveCompletion(policy: AdminPolicy, pref: AgentPreference, agent: AgentIdentity): boolean {
  const c = policy.completion;
  const enabledForAgent = c.enabled === 'all' || (c.enabled === 'listed' && (c.teams.includes(agent.team) || c.users.includes(agent.user)));
  if (!enabledForAgent) return false;
  return !(policy.agentMayLower && pref.completion === false);
}

const isMode = (v: unknown): v is AssistMode => typeof v === 'string' && (MODES as string[]).includes(v);

/** Validates untrusted or stored input, falling back to the default field by field. */
export function parsePolicy(input: unknown): AdminPolicy {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const languages = Array.isArray(o.languages) ? LANGS.filter((l) => (o.languages as unknown[]).includes(l)) : undefined;
  const words = Array.isArray(o.customDictionary)
    ? [...new Set((o.customDictionary as unknown[]).filter((w): w is string => typeof w === 'string').map((w) => w.trim()).filter(Boolean))]
    : undefined;
  return {
    mode: isMode(o.mode) ? o.mode : DEFAULT_POLICY.mode,
    languages: languages ?? [...DEFAULT_POLICY.languages],
    agentMayLower: typeof o.agentMayLower === 'boolean' ? o.agentMayLower : DEFAULT_POLICY.agentMayLower,
    customDictionary: words ?? [],
    completion: parseCompletion(o.completion),
  };
}

const strings = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))] : [];

function parseCompletion(input: unknown): CompletionPolicy {
  const d = DEFAULT_POLICY.completion;
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const src = (o.sources && typeof o.sources === 'object' ? o.sources : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === 'all' || o.enabled === 'listed' || o.enabled === 'off' ? o.enabled : d.enabled,
    teams: strings(o.teams),
    users: strings(o.users),
    sources: {
      transcript: typeof src.transcript === 'boolean' ? src.transcript : d.sources.transcript,
      canned: typeof src.canned === 'boolean' ? src.canned : d.sources.canned,
    },
  };
}

export function parsePreference(input: unknown): AgentPreference {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    ...(isMode(o.mode) ? { mode: o.mode } : {}),
    ...(typeof o.completion === 'boolean' ? { completion: o.completion } : {}),
  };
}
