import { postprocess } from './postprocess.ts';
import { buildUserContent, SYSTEM_INSTRUCTION } from './prompt.ts';
import { retrieve, retrieveKb, type KbPassage } from './retrieval.ts';
import { scriptOf, type CannedResponse, type CompleteReply, type CompleteRequest, type CompletionModel, type Turn } from './types.ts';

export interface CompleteDeps {
  model: CompletionModel | null;
  library: CannedResponse[];
  kb?: KbPassage[];
  timeoutMs?: number;
}

export interface HttpResult {
  status: number;
  body: CompleteReply | { error: string };
}

function parseRequest(input: unknown): CompleteRequest | string {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (typeof o.prefix !== 'string' || !o.prefix.trim()) return 'prefix is required';
  if (o.prefix.length > 2000) return 'prefix too long';
  const transcript: Turn[] = Array.isArray(o.transcript)
    ? o.transcript
        .filter((t): t is Turn => !!t && typeof t === 'object' && (t.role === 'customer' || t.role === 'agent') && typeof t.text === 'string')
        .slice(-50)
    : [];
  const s = (o.sources && typeof o.sources === 'object' ? o.sources : {}) as Record<string, unknown>;
  return {
    prefix: o.prefix,
    transcript,
    sources: { transcript: s.transcript !== false, canned: s.canned !== false, kb: s.kb !== false },
  };
}

/** POST /v1/complete: retrieve → prompt → model → post-process. */
export async function complete(input: unknown, deps: CompleteDeps): Promise<HttpResult> {
  const started = performance.now();
  const req = parseRequest(input);
  if (typeof req === 'string') return { status: 400, body: { error: req } };
  if (!deps.model) return { status: 503, body: { error: 'completion model unavailable (no API key configured)' } };

  const lastCustomer = [...req.transcript].reverse().find((t) => t.role === 'customer')?.text ?? '';
  const sources = req.sources.canned ? retrieve(deps.library, lastCustomer, req.prefix) : [];
  // Knowledge base only on a strong match with the customer's last message.
  const kb = req.sources.kb && deps.kb ? retrieveKb(deps.kb, lastCustomer) : [];
  const user = buildUserContent(req.prefix, req.sources.transcript ? req.transcript : null, sources, kb);

  let raw: string;
  try {
    raw = await deps.model.complete(SYSTEM_INSTRUCTION, user, AbortSignal.timeout(deps.timeoutMs ?? 2000));
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return { status: 504, body: { error: 'completion model timed out' } };
    return { status: 502, body: { error: 'completion model request failed' } };
  }

  const completion = postprocess(req.prefix, raw);
  return {
    status: 200,
    body: {
      completion,
      lang: scriptOf(req.prefix),
      latencyMs: Math.round(performance.now() - started),
      model: deps.model.name,
      sources: [...sources.map((s) => s.id), ...kb.map((p) => p.id)],
    },
  };
}
