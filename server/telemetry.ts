import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { classify, type Lang } from '../eval/error-types.ts';

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
  const spelling = spellingByLang(events);
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
    spelling,
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

export interface SpellingInTheField {
  autocorrects: number;
  reverts: number;
  /** Field counterpart of 1 − auto-replace precision (a lower bound: not every wrong fix is reverted). */
  revertRate: number | null;
  accepts: number;
  ignores: number;
  /** Field proxy for the false-flag rate: ignores ÷ (accepts + ignores). */
  ignoreShare: number | null;
  /** Error types of accepted suggestions and auto-corrections (typed word → correction). */
  errorTypes: Record<string, number>;
  /** Per auto-correction type: how many were made and how many reverted. */
  revertsByType: Record<string, { autocorrects: number; reverts: number; revertRate: number | null }>;
}

const isLang = (l: unknown): l is Lang => l === 'en' || l === 'ar';
const typeOf = (e: StoredEvent, lang: Lang) =>
  e.original && e.replacement ? (classify(e.original, e.replacement, lang)?.type ?? 'unclassified') : 'unclassified';

/** Per-language spelling figures, classified with the benchmark's error-type taxonomy (eval/error-types.ts). */
export function spellingByLang(events: StoredEvent[]): Partial<Record<Lang, SpellingInTheField>> {
  const out: Partial<Record<Lang, SpellingInTheField>> = {};
  const get = (lang: Lang) =>
    (out[lang] ??= { autocorrects: 0, reverts: 0, revertRate: null, accepts: 0, ignores: 0, ignoreShare: null, errorTypes: {}, revertsByType: {} });
  for (const e of events) {
    if (!isLang(e.lang) || !(SPELLING as readonly string[]).includes(e.type)) continue;
    const s = get(e.lang);
    const type = typeOf(e, e.lang);
    const byType = () => (s.revertsByType[type] ??= { autocorrects: 0, reverts: 0, revertRate: null });
    if (e.type === 'autocorrect') {
      s.autocorrects++;
      byType().autocorrects++;
      s.errorTypes[type] = (s.errorTypes[type] ?? 0) + 1;
    } else if (e.type === 'accept') {
      s.accepts++;
      s.errorTypes[type] = (s.errorTypes[type] ?? 0) + 1;
    } else if (e.type === 'revert') {
      // A revert carries the auto-correction's original and replacement, so it has the same type.
      s.reverts++;
      byType().reverts++;
    } else if (e.type === 'ignore') s.ignores++;
  }
  for (const s of Object.values(out)) {
    s.revertRate = s.autocorrects ? s.reverts / s.autocorrects : null;
    s.ignoreShare = s.accepts + s.ignores ? s.ignores / (s.accepts + s.ignores) : null;
    for (const t of Object.values(s.revertsByType)) t.revertRate = t.autocorrects ? t.reverts / t.autocorrects : null;
  }
  return out;
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
${renderSpelling(s.spelling)}
<h2>By event type</h2><table><tr><th>Type</th><th>Count</th></tr>${rows(s.byType)}</table>
<h2>By language</h2><table><tr><th>Language</th><th>Count</th></tr>${rows(s.byLang)}</table>
</body></html>`;
}

function renderSpelling(spelling: Partial<Record<Lang, SpellingInTheField>>): string {
  const langs = Object.entries(spelling) as [Lang, SpellingInTheField][];
  if (!langs.length) return '';
  const rows = langs
    .map(
      ([l, s]) =>
        `<tr><td>${l}</td><td>${s.autocorrects}</td><td>${s.reverts}</td><td>${pct(s.revertRate)}</td><td>${s.accepts}</td><td>${s.ignores}</td><td>${pct(s.ignoreShare)}</td></tr>`,
    )
    .join('');
  const types = langs
    .map(([l, s]) => {
      const all = [...new Set([...Object.keys(s.errorTypes), ...Object.keys(s.revertsByType)])].sort();
      const body = all
        .map((t) => {
          const r = s.revertsByType[t];
          return `<tr><td>${esc(t)}</td><td>${s.errorTypes[t] ?? 0}</td><td>${r?.autocorrects ?? 0}</td><td>${pct(r?.revertRate ?? null)}</td></tr>`;
        })
        .join('');
      return `<h3>${l}: error types in the field</h3><table><tr><th>Error type</th><th>Corrections (accepted + automatic)</th><th>Auto-corrections</th><th>Reverted</th></tr>${body}</table>`;
    })
    .join('');
  return `<h2>Spelling in the field</h2>
<p>Field counterparts of the offline benchmark (npm run eval): the revert rate approximates 1 − auto-replace precision (a lower bound, since not every wrong fix is reverted); the ignore share approximates the false-flag rate; the error types compare with the benchmark's error-type distribution.</p>
<table><tr><th>Language</th><th>Auto-corrections</th><th>Reverts</th><th>Revert rate</th><th>Suggestions accepted</th><th>Ignored</th><th>Ignore share</th></tr>${rows}</table>${types}`;
}
