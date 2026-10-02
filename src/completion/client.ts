export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface CompletionRequest {
  prefix: string;
  transcript: Turn[];
  sources: { transcript: boolean; canned: boolean; kb: boolean };
}

export interface CompletionReply {
  completion: string;
  lang: 'en' | 'ar' | null;
  latencyMs: number;
  model: string;
  sources: string[];
}

export type CompletionFetcher = (body: CompletionRequest, signal: AbortSignal) => Promise<CompletionReply | null>;

/**
 * POST {baseUrl}/v1/complete. Any failure (service down, 503 without a key,
 * timeout, abort) resolves to null: the composer simply shows nothing.
 */
export function createCompletionClient(baseUrl: string, timeoutMs = 2500, doFetch: typeof fetch = (...a) => fetch(...a)): CompletionFetcher {
  return async (body, signal) => {
    try {
      const res = await doFetch(`${baseUrl.replace(/\/$/, '')}/v1/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (!res.ok) return null;
      return (await res.json()) as CompletionReply;
    } catch {
      return null;
    }
  };
}
