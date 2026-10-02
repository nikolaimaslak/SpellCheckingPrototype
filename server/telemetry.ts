import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const COMPLETION = ['completion-shown', 'completion-accepted', 'completion-dismissed'] as const;
const SPELLING = ['autocorrect', 'revert', 'accept', 'ignore'] as const;
const POLISH = ['polish-shown', 'polish-accepted', 'polish-dismissed', 'polish-reverted'] as const;
type EventType = (typeof COMPLETION)[number] | (typeof SPELLING)[number] | (typeof POLISH)[number];

export interface StoredEvent {
  type: EventType;
  ts: number;
  lang?: string;
  session?: string;
  latencyMs?: number;
  shownLength?: number;
  acceptedLength?: number;
  original?: string;
  replacement?: string;
  changes?: number;
}

const COMMON = ['type', 'ts', 'lang', 'session'] as const;
const EXTRA: Record<'completion' | 'spelling' | 'polish', readonly string[]> = {
  completion: ['latencyMs', 'shownLength', 'acceptedLength'],
  spelling: ['original', 'replacement'],
  polish: ['latencyMs', 'changes'],
};

/**
 * Keeps only allowlisted fields per event type, so completion text, transcripts
 * or composer content can never be stored even if a client sends them.
 */
export function sanitize(input: unknown): StoredEvent | null {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const type = o.type as EventType;
  const kind = (COMPLETION as readonly string[]).includes(type)
    ? 'completion'
    : (SPELLING as readonly string[]).includes(type)
      ? 'spelling'
      : (POLISH as readonly string[]).includes(type)
        ? 'polish'
        : null;
  if (!kind) return null;
  const out: Record<string, unknown> = {};
  for (const k of [...COMMON, ...EXTRA[kind]]) {
    const v = o[k];
    if (typeof v === 'string' ? v.length <= 64 : typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  out.type = type;
  if (typeof out.ts !== 'number') out.ts = Date.now();
  return out as unknown as StoredEvent;
}

export function appendEvents(file: string, batch: unknown): number {
  const events = (Array.isArray(batch) ? batch : []).map(sanitize).filter((e): e is StoredEvent => !!e);
  if (!events.length) return 0;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return events.length;
}

export function readEvents(file: string): StoredEvent[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as StoredEvent];
      } catch {
        return [];
      }
    });
}

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null;

export function summarize(events: StoredEvent[]) {
  const count = (t: EventType) => events.filter((e) => e.type === t).length;
  const shown = count('completion-shown');
  const accepted = count('completion-accepted');
  const autocorrects = count('autocorrect');
  const reverts = count('revert');
  const latencies = events
    .filter((e) => e.type === 'completion-shown' && typeof e.latencyMs === 'number')
    .map((e) => e.latencyMs!)
    .sort((a, b) => a - b);
  const polishShown = events.filter((e) => e.type === 'polish-shown' && (e.changes ?? 0) > 0).length;
  const polishLatencies = events
    .filter((e) => e.type === 'polish-shown' && typeof e.latencyMs === 'number')
    .map((e) => e.latencyMs!)
    .sort((a, b) => a - b);
  const tally = (key: 'type' | 'lang') =>
    events.reduce<Record<string, number>>((acc, e) => ((acc[e[key] ?? '—'] = (acc[e[key] ?? '—'] ?? 0) + 1), acc), {});
  return {
    total: events.length,
    completion: {
      shown,
      accepted,
      dismissed: count('completion-dismissed'),
      acceptanceRate: shown ? accepted / shown : null,
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
    },
    autocorrect: { count: autocorrects, reverts, revertRate: autocorrects ? reverts / autocorrects : null },
    polish: {
      shownWithChanges: polishShown,
      accepted: count('polish-accepted'),
      acceptanceRate: polishShown ? count('polish-accepted') / polishShown : null,
      latencyP50: percentile(polishLatencies, 50),
    },
    byType: tally('type'),
    byLang: tally('lang'),
  };
}

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const ms = (v: number | null) => (v === null ? '—' : `${v} ms`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderSummary(s: ReturnType<typeof summarize>): string {
  const rows = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`)
      .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Assistance telemetry</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;color:#1c2430;background:#f6f7f9}table{border-collapse:collapse;margin:8px 0 16px}td,th{border:1px solid #d5dae1;padding:4px 10px;text-align:left}h2{font-size:1rem;margin-top:20px}.k{font-size:1.6rem;font-weight:600}.grid{display:flex;gap:24px;flex-wrap:wrap}.grid div{background:#fff;border:1px solid #d5dae1;border-radius:8px;padding:10px 14px}
@media (prefers-color-scheme: dark){body{background:#14181e;color:#e4e8ee}.grid div{background:#1c222b;border-color:#333c48}td,th{border-color:#333c48}}</style></head><body>
<h1>Assistance telemetry</h1><p>${s.total} events (local dev log; no conversation text is recorded).</p>
<div class="grid">
<div>Completion acceptance<div class="k">${pct(s.completion.acceptanceRate)}</div>${s.completion.accepted} of ${s.completion.shown} shown</div>
<div>Completion latency<div class="k">${ms(s.completion.latencyP50)}</div>p50 · p95 ${ms(s.completion.latencyP95)}</div>
<div>Auto-correct revert rate<div class="k">${pct(s.autocorrect.revertRate)}</div>${s.autocorrect.reverts} of ${s.autocorrect.count}</div>
<div>Polish acceptance<div class="k">${pct(s.polish.acceptanceRate)}</div>${s.polish.accepted} of ${s.polish.shownWithChanges} previews · p50 ${ms(s.polish.latencyP50)}</div>
</div>
<h2>By event type</h2><table><tr><th>Type</th><th>Count</th></tr>${rows(s.byType)}</table>
<h2>By language</h2><table><tr><th>Language</th><th>Count</th></tr>${rows(s.byLang)}</table>
</body></html>`;
}
