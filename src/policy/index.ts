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
  grammar: GrammarPolicy;
}

/** Inline completion sends text to a hosted model, so it is opt-in per tenant, team or user. */
/** Who gets a feature: nobody, everyone, or only the listed teams and users. */
export interface Enablement {
  enabled: 'off' | 'all' | 'listed';
  teams: string[];
  users: string[];
}

export interface CompletionPolicy extends Enablement {
  sources: { transcript: boolean; canned: boolean; kb: boolean };
}

/** On-demand grammar polish sends the draft to a hosted model, so it is opt-in too. */
export type GrammarPolicy = Enablement;

export interface AgentPreference {
  mode?: AssistMode;
  /** false turns completion off for this agent (only honored when the admin allows agent choice). */
  completion?: boolean;
  /** false turns grammar polish off for this agent (only honored when the admin allows agent choice). */
  grammar?: boolean;
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
  completion: { enabled: 'off', teams: [], users: [], sources: { transcript: true, canned: true, kb: true } },
  grammar: { enabled: 'off', teams: [], users: [] },
};

const RANK: Record<AssistMode, number> = { off: 0, suggest: 1, auto: 2 };
const MODES = Object.keys(RANK) as AssistMode[];
const LANGS: Lang[] = ['en', 'ar'];

/** The admin mode, unless the admin allows agent choice and the agent picked a less aggressive one. */
export function resolveMode(policy: AdminPolicy, pref: AgentPreference = {}): AssistMode {
  if (policy.agentMayLower && pref.mode && RANK[pref.mode] < RANK[policy.mode]) return pref.mode;
  return policy.mode;
}

const enabledFor = (e: Enablement, agent: AgentIdentity) =>
  e.enabled === 'all' || (e.enabled === 'listed' && (e.teams.includes(agent.team) || e.users.includes(agent.user)));

/** Completion is effective if the admin enables it for this agent and the agent (when allowed) hasn't opted out. */
export function resolveCompletion(policy: AdminPolicy, pref: AgentPreference, agent: AgentIdentity): boolean {
  return enabledFor(policy.completion, agent) && !(policy.agentMayLower && pref.completion === false);
}

/** Grammar polish follows the same rule as completion. */
export function resolveGrammar(policy: AdminPolicy, pref: AgentPreference, agent: AgentIdentity): boolean {
  return enabledFor(policy.grammar, agent) && !(policy.agentMayLower && pref.grammar === false);
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
    grammar: parseEnablement(o.grammar),
  };
}

const strings = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))] : [];

function parseEnablement(input: unknown): Enablement {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === 'all' || o.enabled === 'listed' || o.enabled === 'off' ? o.enabled : 'off',
    teams: strings(o.teams),
    users: strings(o.users),
  };
}

function parseCompletion(input: unknown): CompletionPolicy {
  const d = DEFAULT_POLICY.completion;
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const src = (o.sources && typeof o.sources === 'object' ? o.sources : {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    ...parseEnablement(o),
    sources: {
      transcript: bool(src.transcript, d.sources.transcript),
      canned: bool(src.canned, d.sources.canned),
      kb: bool(src.kb, d.sources.kb),
    },
  };
}

export function parsePreference(input: unknown): AgentPreference {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    ...(isMode(o.mode) ? { mode: o.mode } : {}),
    ...(typeof o.completion === 'boolean' ? { completion: o.completion } : {}),
    ...(typeof o.grammar === 'boolean' ? { grammar: o.grammar } : {}),
  };
}
