export type Lang = 'en' | 'ar';

export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface CannedResponse {
  id: string;
  lang: Lang;
  text: string;
}

export interface CompleteRequest {
  prefix: string;
  transcript: Turn[];
  sources: { transcript: boolean; canned: boolean; kb: boolean };
}

export interface CompleteReply {
  completion: string;
  lang: Lang | null;
  latencyMs: number;
  model: string;
  sources: string[];
  /** With a completion: the agent's unfinished word (`typed`), its completed form and what follows. */
  edit?: { typed: string; word: string; rest: string };
  /** Set when the model's output couldn't be used. The reason only, never the text. */
  withheld?: 'format';
}

export interface GenerationOptions {
  maxOutputTokens?: number;
  stopSequences?: string[];
  /** Asks for JSON matching this schema (Gemini's OpenAPI subset); the reply text is that JSON. */
  responseSchema?: object;
}

/** Model-agnostic text backend (Gemini in dev, a fake in tests); used by completion and polish. */
export interface CompletionModel {
  name: string;
  complete(system: string, user: string, signal: AbortSignal, opts?: GenerationOptions): Promise<string>;
}

/** Script of the last word: decides the reply language and the post-processing script check. */
export function scriptOf(text: string): Lang | null {
  const words = text.match(/[\p{L}\p{M}]+/gu);
  const last = words?.at(-1) ?? '';
  if (/\p{Script=Arabic}/u.test(last)) return 'ar';
  if (/\p{Script=Latin}/u.test(last)) return 'en';
  return null;
}
