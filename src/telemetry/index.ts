export interface TelemetryOptions {
  /** e.g. '/api/v1/events'. */
  url: string;
  session: string;
  flushMs?: number;
  fetch?: typeof fetch;
  sendBeacon?: (url: string, data: string) => boolean;
  document?: Document;
}

export interface Telemetry {
  record<E extends { type: string; lang?: string }>(event: E): void;
  flush(): void;
  stop(): void;
}

/**
 * Batches assistance events to the telemetry endpoint every few seconds and
 * when the page is hidden. Failures are swallowed: telemetry must never affect
 * the composer, and undelivered events may be dropped.
 */
export function createTelemetry(opts: TelemetryOptions): Telemetry {
  const { url, session, flushMs = 5000 } = opts;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const beacon = opts.sendBeacon ?? ((u: string, d: string) => navigator.sendBeacon?.(u, new Blob([d], { type: 'application/json' })) ?? false);
  const doc = opts.document ?? document;
  let queue: Record<string, unknown>[] = [];

  const flush = () => {
    if (!queue.length) return;
    const body = JSON.stringify(queue);
    queue = [];
    void doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  const onHidden = () => {
    if (doc.visibilityState !== 'hidden' || !queue.length) return;
    const body = JSON.stringify(queue);
    queue = [];
    try {
      beacon(url, body);
    } catch {
      // dropped
    }
  };

  const timer = setInterval(flush, flushMs);
  doc.addEventListener('visibilitychange', onHidden);

  return {
    record(event) {
      queue.push({ ...event, ts: Date.now(), session });
    },
    flush,
    stop() {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onHidden);
      flush();
    },
  };
}
