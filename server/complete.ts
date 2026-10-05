import { postprocess } from './postprocess.ts';
import { buildUserContent, systemInstruction } from './prompt.ts';
import { normalize, retrieve, retrieveKb, type KbPassage } from './retrieval.ts';
import { safetyCheck, vocabulary, type WithheldReason } from './safety.ts';
import { scriptOf, type CannedResponse, type CompleteReply, type CompleteRequest, type CompletionModel, type Lang, type Turn } from './types.ts';

export interface CompleteDeps {
  model: CompletionModel | null;
  library: CannedResponse[];
  kb?: KbPassage[];
  timeoutMs?: number;
  /** COMPLETION_SOURCED_FIGURES=allow (default false: Req 3.7 as written). */
  allowSourcedFigures?: boolean;
  /** Told the reason (never the text) whenever the safety filter withholds a completion. */
  onWithheld?: (reason: WithheldReason, lang: Lang | null) => void;
}

// Vocabulary of the whole approved library, computed once per data set.
const vocabularies = new WeakMap<CannedResponse[], { kb: KbPassage[] | undefined; words: Set<string> }>();
function libraryVocabulary(library: CannedResponse[], kb: KbPassage[] | undefined): Set<string> {
  const cached = vocabularies.get(library);
  if (cached && cached.kb === kb) return cached.words;
  const words = vocabulary([...library.map((c) => c.text), ...(kb ?? []).map((p) => p.text)]);
  vocabularies.set(library, { kb, words });
  return words;
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
    raw = await deps.model.complete(systemInstruction(deps.allowSourcedFigures ?? false), user, AbortSignal.timeout(deps.timeoutMs ?? 2000));
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return { status: 504, body: { error: 'completion model timed out' } };
    return { status: 502, body: { error: 'completion model request failed' } };
  }

  const lang = scriptOf(req.prefix);
  // Words that tell whether an unfinished word is being completed: the approved
  // library, the conversation and the agent's own text.
  const library = libraryVocabulary(deps.library, deps.kb);
  // The prefix's own unfinished last word must not count as a known word.
  const finishedPrefix = /\s$/u.test(req.prefix) ? req.prefix : req.prefix.replace(/[\p{L}\p{N}\p{M}]+$/u, '');
  const local = vocabulary([finishedPrefix, ...req.transcript.map((t) => t.text)]);
  const isWord = (w: string) => library.has(normalize(w)) || local.has(normalize(w));
  let completion = postprocess(req.prefix, raw, isWord);
  // Req 3.7: withhold, never shorten, a completion with figures, dates, identifiers or customer words.
  const withheld = completion
    ? safetyCheck(completion, {
        prefix: req.prefix,
        customerTurns: req.transcript.filter((t) => t.role === 'customer').map((t) => t.text),
        sent: [...sources.map((s) => s.text), ...kb.map((p) => p.text)],
        library,
        allowSourcedFigures: deps.allowSourcedFigures ?? false,
      })
    : null;
  if (withheld) {
    completion = '';
    deps.onWithheld?.(withheld, lang);
  }
  return {
    status: 200,
    body: {
      completion,
      lang,
      ...(withheld ? { withheld } : {}),
      latencyMs: Math.round(performance.now() - started),
      model: deps.model.name,
      sources: [...sources.map((s) => s.id), ...kb.map((p) => p.id)],
    },
  };
}
