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
  sources: { transcript: boolean; canned: boolean };
}

export interface CompleteReply {
  completion: string;
  lang: Lang | null;
  latencyMs: number;
  model: string;
  sources: string[];
}

/** Model-agnostic completion backend (Gemini in dev, a fake in tests). */
export interface CompletionModel {
  name: string;
  complete(system: string, user: string, signal: AbortSignal): Promise<string>;
}

/** Script of the last word: decides the reply language and the post-processing script check. */
export function scriptOf(text: string): Lang | null {
  const words = text.match(/[\p{L}\p{M}]+/gu);
  const last = words?.at(-1) ?? '';
  if (/\p{Script=Arabic}/u.test(last)) return 'ar';
  if (/\p{Script=Latin}/u.test(last)) return 'en';
  return null;
}
