import type { CompletionModel, Lang } from './types.ts';

export const POLISH_INSTRUCTION = [
  'You correct grammar, spelling and punctuation in a message a contact-center agent wrote to a customer.',
  'Fix only errors. Keep the meaning, tone, wording and line breaks. Do not rephrase, shorten, expand or translate.',
  'Keep the language of the message (Arabic or English).',
  'Keep every placeholder like $(user.firstName), every URL, email address, number and reference code exactly as written.',
  'Return only the corrected message, with no quotes, notes or explanation.',
].join('\n');

const MAX_CHARS = 4000;

// The same spans the tokenizer never checks; a polish must not touch them.
const PROTECTED: { re: RegExp; trim: boolean }[] = [
  { re: /\$\([^)]*\)/gu, trim: false },
  { re: /\b(?:https?:\/\/|www\.)\S+/giu, trim: true },
  { re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, trim: false },
  { re: /\S*\p{Nd}\S*/gu, trim: true },
];

export function protectedTokens(text: string): string[] {
  const found: string[] = [];
  for (const { re, trim } of PROTECTED) {
    for (const m of text.matchAll(re)) found.push(trim ? m[0].replace(/\p{P}+$/u, '') : m[0]);
  }
  return found.sort();
}

export function majorityScript(text: string): Lang {
  const ar = (text.match(/\p{Script=Arabic}/gu) ?? []).length;
  const la = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  return ar > la ? 'ar' : 'en';
}

const lineBreaks = (t: string) => (t.match(/\n/g) ?? []).length;

/** Strips wrappers models sometimes add: code fences and surrounding quotes. */
export function cleanOutput(raw: string): string {
  let out = raw.replace(/\r\n?/g, '\n').trim();
  const fence = out.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();
  if (/^(["“«]).*(["”»])$/su.test(out)) out = out.slice(1, -1).trim();
  return out;
}

/** Returns a reason when the corrected text is unsafe to offer, or null. */
export function safetyCheck(draft: string, polished: string): string | null {
  const a = protectedTokens(draft);
  const b = protectedTokens(polished);
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) return 'protected content (placeholders, links, numbers) would change';
  const ratio = polished.length / Math.max(draft.length, 1);
  if (ratio < 0.7 || ratio > 1.3) return 'the correction would rewrite too much of the message';
  if (lineBreaks(draft) !== lineBreaks(polished)) return 'the correction would change line breaks';
  return null;
}

export interface PolishReply {
  polished: string;
  changed: boolean;
  lang: Lang;
  latencyMs: number;
  model: string;
  reason?: string;
}

export interface PolishResult {
  status: number;
  body: PolishReply | { error: string };
}

/** POST /v1/polish: minimal grammar and spelling correction with safety checks. */
export async function polish(input: unknown, deps: { model: CompletionModel | null; timeoutMs?: number }): Promise<PolishResult> {
  const started = performance.now();
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text.replace(/\r\n?/g, '\n') : '';
  if (!text.trim()) return { status: 400, body: { error: 'text is required' } };
  if (text.length > MAX_CHARS) return { status: 400, body: { error: 'text too long' } };
  if (!deps.model) return { status: 503, body: { error: 'polish model unavailable (no API key configured)' } };

  let raw: string;
  try {
    raw = await deps.model.complete(POLISH_INSTRUCTION, text, AbortSignal.timeout(deps.timeoutMs ?? 4000), {
      maxOutputTokens: Math.min(2048, Math.ceil(text.length / 2) + 64),
      stopSequences: [],
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return { status: 504, body: { error: 'polish model timed out' } };
    return { status: 502, body: { error: 'polish model request failed' } };
  }

  const lang = majorityScript(text);
  const base = { lang, model: deps.model.name };
  // Models drop surrounding whitespace (e.g. the trailing line break of an
  // email paragraph); keep the draft's own, so only the inner text is compared.
  const inner = cleanOutput(raw);
  const candidate = inner ? text.match(/^\s*/)![0] + inner + text.match(/\s*$/)![0] : '';
  const reason = candidate ? safetyCheck(text, candidate) : 'the model returned nothing';
  const latencyMs = Math.round(performance.now() - started);
  if (reason) return { status: 200, body: { polished: text, changed: false, reason, latencyMs, ...base } };
  return { status: 200, body: { polished: candidate, changed: candidate !== text, latencyMs, ...base } };
}
