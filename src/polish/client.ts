export interface PolishReply {
  polished: string;
  changed: boolean;
  lang: 'en' | 'ar';
  latencyMs: number;
  model: string;
  reason?: string;
}

export type PolishFetcher = (text: string, signal: AbortSignal) => Promise<PolishReply | null>;

/** POST {baseUrl}/v1/polish; any failure resolves to null ("polishing unavailable"). */
export function createPolishClient(baseUrl: string, timeoutMs = 6000, doFetch: typeof fetch = (...a) => fetch(...a)): PolishFetcher {
  return async (text, signal) => {
    try {
      const res = await doFetch(`${baseUrl.replace(/\/$/, '')}/v1/polish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (!res.ok) return null;
      return (await res.json()) as PolishReply;
    } catch {
      return null;
    }
  };
}
