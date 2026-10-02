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
}

export interface AgentPreference {
  mode?: AssistMode;
}

/** Auto-correct must be an explicit admin choice, so the default only suggests. */
export const DEFAULT_POLICY: AdminPolicy = {
  mode: 'suggest',
  languages: ['en', 'ar'],
  agentMayLower: true,
  customDictionary: [],
};

const RANK: Record<AssistMode, number> = { off: 0, suggest: 1, auto: 2 };
const MODES = Object.keys(RANK) as AssistMode[];
const LANGS: Lang[] = ['en', 'ar'];

/** The admin mode, unless the admin allows agent choice and the agent picked a less aggressive one. */
export function resolveMode(policy: AdminPolicy, pref: AgentPreference = {}): AssistMode {
  if (policy.agentMayLower && pref.mode && RANK[pref.mode] < RANK[policy.mode]) return pref.mode;
  return policy.mode;
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
  };
}

export function parsePreference(input: unknown): AgentPreference {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return isMode(o.mode) ? { mode: o.mode } : {};
}
