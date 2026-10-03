// Writes a benchmark result as eval/reports/latest.json and latest.md. The
// result already holds only aggregates for private datasets (no words, no
// examples), so nothing here can leak their text.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkResult } from './benchmark.ts';
import type { Metrics } from './metrics.ts';
import type { WordOutcome } from './types.ts';

const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(digits)}%`);
const num = (x: number | null | undefined, digits = 2) => (x === null || x === undefined ? '–' : x.toFixed(digits));
/** Isolates a word or message so Arabic displays in its own direction inside Markdown. */
const bdi = (s: string) => `<bdi>${s.replace(/[|<>]/g, (c) => ({ '|': '\\|', '<': '&lt;', '>': '&gt;' })[c]!)}</bdi>`;
const table = (head: string[], rows: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

function metricRow(name: string, m: Metrics): string[] {
  return [
    name,
    String(m.counts.correct),
    String(m.counts.misspelled),
    pct(m.detectionRecall),
    pct(m.falseFlagRate, 2),
    pct(m.correctionAt1),
    pct(m.correctionAt5),
    pct(m.autoReplacePrecision),
    pct(m.autoReplaceCoverage),
    m.corruptionPer10k === null ? '–' : `${num(m.corruptionPer10k, 1)} (≤ ${num(m.corruptionUpper95Per10k, 1)})`,
    String(m.counts.exclusionLeaks),
  ];
}
const METRIC_HEAD = ['', 'Correct words', 'Misspellings', 'Detection recall', 'False flags', 'Correction@1', 'Correction@5', 'Auto-replace precision', 'Auto-replace coverage', 'Corruption /10k (95% ≤)', 'Exclusion leaks'];

const TYPE_HEAD = ['Error type', 'Misspellings', 'Detection recall', 'Correction@1', 'Correction@5', 'Auto-replace coverage', 'Wrong fixes'];
const typeRows = (byType: Record<string, Metrics>) =>
  Object.entries(byType)
    .sort((a, b) => b[1].counts.misspelled - a[1].counts.misspelled)
    .map(([t, m]) => [t, String(m.counts.misspelled), pct(m.detectionRecall), pct(m.correctionAt1), pct(m.correctionAt5), pct(m.autoReplaceCoverage), String(m.counts.wrongFix)]);

function example(o: WordOutcome): string {
  const change = o.replacement ? `${bdi(o.word)} → ${bdi(o.replacement)}` : bdi(o.word);
  const gold = o.gold === 'misspelled' ? `, intended ${bdi(o.intended ?? '')}${o.errorType ? ` (${o.errorType})` : ''}` : o.gold === 'excluded' ? ', excluded span' : '';
  const ct = o.correctionType ? `, correction type ${o.correctionType}` : '';
  return `- ${change}${gold}${ct} — ${o.dataset} ${o.messageId}: ${bdi(o.context)}`;
}

export function renderMarkdown(r: BenchmarkResult): string {
  const out: string[] = [];
  out.push(`# Spelling benchmark`, '', `Build ${r.build.version} · ${r.build.commit} · ${r.build.date}`, '');
  out.push(
    table(
      ['Dataset', 'Kind', 'Language', 'Messages'],
      r.datasets.map((d) => [d.name, d.private ? 'private (aggregates only)' : d.kind, d.lang, String(d.messages)]),
    ),
    '',
  );

  out.push('## Acceptance criteria (provisional)', '', 'Gate: criteria marked 🔒 decide whether auto-replace may be on by default.', '');
  out.push(
    table(
      ['Criterion', 'Language', 'Value', 'Threshold', 'Result'],
      r.verdicts.map((v) => {
        const c = v.criterion;
        const rate = ['detectionRecall', 'falseFlagRate', 'correctionAt1', 'correctionAt5', 'autoReplacePrecision'].includes(c.metric);
        const fmt = (x: number | null) => (rate ? pct(x, 2) : num(x, c.metric.endsWith('Ms') ? 1 : c.metric === 'corruptionPer10k' ? 1 : 0));
        const extra = c.metric === 'corruptionPer10k' ? ` (95% ≤ ${num(r.summary.scopes.clean[c.lang]?.corruptionUpper95Per10k ?? null, 1)})` : '';
        return [`${c.gate ? '🔒 ' : ''}${c.label}`, c.lang, fmt(v.value) + extra, `${c.direction === 'min' ? '≥' : '≤'} ${fmt(c.threshold)}`, v.pass === null ? '–' : v.pass ? '✅' : '❌'];
      }),
    ),
    '',
  );

  out.push('## Detection, correction and auto-replace', '');
  out.push('### By language (committed data)', '', table(METRIC_HEAD, Object.entries(r.byLang).map(([l, b]) => metricRow(l, b.metrics))), '');
  out.push('### By dataset', '', table(METRIC_HEAD, r.datasets.map((d) => metricRow(d.name, d.metrics))), '');

  out.push('## Error types', '');
  for (const [lang, b] of Object.entries(r.byLang)) out.push(`### ${lang}: misspellings by error type`, '', table(TYPE_HEAD, typeRows(b.byType)), '');
  out.push('### Error-type distribution per dataset', '');
  for (const d of r.datasets.filter((d) => Object.keys(d.typeDistribution).length)) {
    const total = Object.values(d.typeDistribution).reduce((a, b) => a + b, 0);
    const parts = Object.entries(d.typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} ${n} (${pct(n / total, 0)})`);
    out.push(`- **${d.name}**: ${parts.join(', ')}`);
  }
  out.push('');

  out.push('## Error-type matrix', '', 'Each of the most frequent words of the word list, with one variant of every error type, evaluated alone.', '');
  for (const [lang, m] of Object.entries(r.matrix)) {
    out.push(`### ${lang} (${m.words} words, seed ${m.seed})`, '');
    out.push(
      table(
        ['Error type', 'Variants', 'Real-word discards', 'Not applicable', 'Detection recall', 'Correction@1', 'Correction@5', 'Auto-replace coverage', 'Wrong fixes'],
        m.rows.map((row) => [
          row.type,
          String(row.generated),
          String(row.realWordDiscards),
          String(row.notApplicable),
          pct(row.detectionRecall),
          pct(row.correctionAt1),
          pct(row.correctionAt5),
          pct(row.autoReplaceCoverage),
          String(row.wrongFixes),
        ]),
      ),
      '',
    );
  }

  out.push('## Correction types', '', 'The edit the system’s top correction makes (typed word → correction). Rows: the error the agent made. A correction to the intended word is counted in “on target”.', '');
  for (const [lang, b] of Object.entries(r.byLang)) {
    const ct = b.correctionTypes;
    const cols = [...new Set(Object.values(ct.table).flatMap((row) => Object.keys(row)))].sort();
    out.push(`### ${lang}`, '');
    if (cols.length) {
      out.push(
        table(
          ['Error type', ...cols, 'On target'],
          Object.entries(ct.table).map(([et, row]) => [et, ...cols.map((c) => String(row[c] ?? '')), String(ct.onTarget[et] ?? 0)]),
        ),
        '',
      );
    }
    const dist = (o: Record<string, number>) => Object.entries(o).map(([t, n]) => `${t} ${n}`).join(', ') || 'none';
    out.push(`- All corrections: ${dist(ct.distribution)}`, `- Corruptions: ${dist(ct.corruptions)}`, `- Wrong fixes: ${dist(ct.wrongFixes)}`, '');
  }

  out.push('## Stability', '', `Tokens whose decision differed between runs (including the run under CPU load): **${r.instability.total}**.`, '');
  for (const u of r.instability.examples) out.push(`- ${bdi(u.word)} — ${u.dataset} ${u.messageId}: ${u.runs.map((x) => bdi(x)).join(' / ')}`);
  out.push('');

  out.push('## Latency (engine, in-process)', '');
  out.push(
    table(
      ['Language', 'Check p95 (ms)', 'Correction p95 (ms)'],
      Object.entries(r.latency).map(([l, v]) => [l, num(v?.checkP95Ms ?? null), num(v?.suggestP95Ms ?? null)]),
    ),
    '',
  );

  const list = (title: string, items: WordOutcome[]) => {
    out.push(`## ${title} (${items.length}${items.length === 50 ? '+' : ''})`, '');
    out.push(...(items.length ? items.map(example) : ['None.']), '');
  };
  list('Corruptions', r.examples.corruptions);
  list('Wrong fixes', r.examples.wrongFixes);
  list('Exclusion leaks', r.examples.exclusionLeaks);
  return out.join('\n');
}

export function writeReports(result: BenchmarkResult, dir = 'eval/reports'): { json: string; md: string } {
  mkdirSync(dir, { recursive: true });
  const json = join(dir, 'latest.json');
  const md = join(dir, 'latest.md');
  writeFileSync(json, JSON.stringify(result, null, 2) + '\n');
  writeFileSync(md, renderMarkdown(result) + '\n');
  return { json, md };
}
