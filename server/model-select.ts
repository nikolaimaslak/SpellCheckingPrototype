import { createFakeModel } from './models/fake.ts';
import { createGeminiModel } from './models/gemini.ts';
import type { CompletionModel } from './types.ts';

export type ModelMode = 'auto' | 'gemini' | 'fake';

export interface ModelSelection {
  model: CompletionModel | null;
  mode: ModelMode;
  /** True when requests send text outside this machine (hosted model). */
  external: boolean;
  /** Set when COMPLETION_MODEL had an unknown value and auto was used instead. */
  warning?: string;
}

/**
 * COMPLETION_MODEL: auto (default) = Gemini with GEMINI_API_KEY, otherwise the
 * offline test model; gemini = Gemini only (unavailable without a key);
 * fake = offline test model only.
 */
export function selectModel(env: Record<string, string | undefined>): ModelSelection {
  const raw = (env.COMPLETION_MODEL || 'auto').trim().toLowerCase();
  const known = raw === 'auto' || raw === 'gemini' || raw === 'fake';
  const mode: ModelMode = known ? (raw as ModelMode) : 'auto';
  const warning = known ? undefined : `unknown COMPLETION_MODEL "${env.COMPLETION_MODEL}", using auto`;
  const key = env.GEMINI_API_KEY?.trim();

  if (mode === 'fake' || (mode === 'auto' && !key)) return { model: createFakeModel(), mode, external: false, warning };
  if (!key) return { model: null, mode, external: false, warning };
  return { model: createGeminiModel({ apiKey: key }), mode, external: true, warning };
}
