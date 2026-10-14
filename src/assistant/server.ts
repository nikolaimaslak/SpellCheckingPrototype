// Calls to the Python server (through the page's /api proxy). Any failure
// (server down, 503 without a key, timeout, abort) resolves to null: the
// field simply shows nothing.

export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface CompletionRequest {
  /** The agent's text up to the caret. */
  prefix: string;
  transcript: Turn[];
  sources: { transcript: boolean; canned: boolean; kb: boolean };
  /** Searched instead of the server's own canned.json / kb.json ("Title: body" per KB item). */
  canned: string[];
  kb: string[];
}

export interface CompletionReply {
  completion: string;
  lang: 'en' | 'ar' | null;
  latencyMs: number;
  model: string;
  sources: string[];
  /** The agent's unfinished word (`typed`), its completed form and what follows. */
  edit?: { typed: string; word: string; rest: string };
}

export interface PolishReply {
  polished: string;
  changed: boolean;
  lang: 'en' | 'ar';
  latencyMs: number;
  model: string;
  reason?: string;
}

/** Which model answers completion and polish. `external`: typed text leaves this machine. */
export interface ModelInfo {
  model: string;
  external: boolean;
}

export interface Server {
  complete(body: CompletionRequest, signal: AbortSignal): Promise<CompletionReply | null>;
  polish(text: string, signal: AbortSignal): Promise<PolishReply | null>;
}

async function post<T>(path: string, body: unknown, signal: AbortSignal, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The server's model, or null when the server isn't running. */
export async function fetchModel(): Promise<ModelInfo | null> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as ModelInfo) : null;
  } catch {
    return null;
  }
}

export const server: Server = {
  complete: (body, signal) => post<CompletionReply>('/v1/complete', body, signal, 2500),
  polish: (text, signal) => post<PolishReply>('/v1/polish', { text }, signal, 6000),
};
