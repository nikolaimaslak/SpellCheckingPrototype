// The completion benchmark report: Markdown for people, JSON for tools. The
// dataset is synthetic, so completion text may appear; no key ever does.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from './cases.ts';
import type { Verdict } from './criteria.ts';
import type { Baseline, GateResult } from './gate.ts';
import { COLUMNS, type CaseSummary, type Metrics, type MetricsTable } from './metrics.ts';

export interface CompletionReport {
  model: string;
  date: string;
  samples: number;
  datasetHash: string;
  cases: number;
  verdicts: Verdict[];
  table: MetricsTable;
  caseSummaries: CaseSummary[];
  baseline?: Baseline | null;
  gate?: GateResult | null;
}

const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);
const ms = (v: number | null) => (v === null ? '–' : `${Math.round(v)}`);
const num = (v: number | null) => (v === null ? '–' : v.toFixed(2));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function value(metric: string, v: number | null): string {
  if (metric.endsWith('Ms')) return v === null ? '–' : `${Math.round(v)} ms`;
  if (metric === 'distinctPerCase') return num(v);
  return pct(v);
}

const ROWS: [keyof Metrics, string, (v: number | null) => string][] = [
  ['samples', 'Samples', (v) => String(v ?? 0)],
  ['shownRate', 'Shown', pct],
  ['formatRate', 'Withheld: format', pct],
  ['errorRate', 'Errors', pct],
  ['seamAccuracy', 'Seam word correct', pct],
  ['spacingErrorRate', 'Spacing errors', pct],
  ['inventionRate', 'Invented details', pct],
  ['shownAgreement', 'Shown agreement', pct],
  ['distinctPerCase', 'Distinct completions per case', num],
  ['p50Ms', 'Latency p50 (ms)', ms],
  ['p95Ms', 'Latency p95 (ms)', ms],
];

function table(cols: string[], get: (col: string) => Metrics): string[] {
  const out = [`| Metric | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---:').join('|')}|`];
  for (const [key, label, f] of ROWS) out.push(`| ${label} | ${cols.map((c) => f(get(c)[key] as number | null)).join(' | ')} |`);
  return out;
}

export function renderMarkdown(r: CompletionReport): string {
  const lines: string[] = [
    '# Completion benchmark',
    '',
    `Model **${r.model}** · ${r.samples} samples per case · ${r.cases} cases · dataset \`${r.datasetHash.slice(0, 12)}\` · ${r.date}`,
    '',
  ];
  if (r.gate) {
    if (r.gate.refused) lines.push(`**Gate: not compared.** ${r.gate.refused}.`, '');
    else if (r.gate.regressions.length) lines.push('**Gate: FAIL**', '', ...r.gate.regressions.map((x) => `- ${x}`), '');
    else lines.push('**Gate: pass**', '');
    if (r.gate.improvements.length) lines.push('Improvements:', '', ...r.gate.improvements.map((x) => `- ${x}`), '');
  }
  lines.push('## Criteria', '', '| Criterion | Value | Threshold | Baseline | Meets threshold |', '|---|---:|---:|---:|---|');
  for (const v of r.verdicts) {
    const c = v.criterion;
    const base = r.baseline?.criteria[c.id];
    const kind = c.compare === false ? ' (threshold only)' : '';
    lines.push(`| ${c.label}${kind} | ${value(c.metric, v.value)} | ${c.direction === 'min' ? '≥' : '≤'} ${value(c.metric, c.threshold)} | ${base === undefined ? '–' : value(c.metric, base)} | ${v.pass === null ? '–' : v.pass ? 'yes' : '**no**'} |`);
  }
  lines.push('', '## By language', '', ...table(COLUMNS, (c) => r.table.byColumn[c as keyof MetricsTable['byColumn']]));
  lines.push('', '## By category', '', ...table([...CATEGORIES], (c) => r.table.byCategory[c as keyof MetricsTable['byCategory']]));

  const seamWorst = r.caseSummaries.filter((s) => s.seamChecked && s.seamOk < s.seamChecked).sort((a, b) => a.seamOk / a.seamChecked - b.seamOk / b.seamChecked);
  lines.push('', '## Wrong seam words', '');
  if (!seamWorst.length) lines.push('None.');
  else lines.push('| Case | Correct | Example |', '|---|---:|---|', ...seamWorst.map((s) => `| ${s.id} | ${s.seamOk}/${s.seamChecked} | ${cell(JSON.stringify(s.example))} |`));

  const unstable = r.caseSummaries.filter((s) => s.shown > 0 && s.shown < s.samples).sort((a, b) => a.shown - b.shown);
  lines.push('', '## Unstable cases (shown in some samples only)', '');
  if (!unstable.length) lines.push('None.');
  else lines.push('| Case | Shown | Format | Errors | Example |', '|---|---:|---:|---:|---|', ...unstable.map((s) => `| ${s.id} | ${s.shown}/${s.samples} | ${s.format} | ${s.errors} | ${cell(JSON.stringify(s.example))} |`));

  const never = r.caseSummaries.filter((s) => s.shown === 0);
  lines.push('', '## Never shown', '');
  if (!never.length) lines.push('None.');
  else lines.push('| Case | Format | Errors |', '|---|---:|---:|', ...never.map((s) => `| ${s.id} | ${s.format}/${s.samples} | ${s.errors} |`));

  const invented = r.caseSummaries.filter((s) => s.inventions.length);
  lines.push('', '## Invented details', '');
  if (!invented.length) lines.push('None.');
  else lines.push('| Case | Details | Example |', '|---|---|---|', ...invented.map((s) => `| ${s.id} | ${cell(s.inventions.join(', '))} | ${cell(JSON.stringify(s.example))} |`));
  return lines.join('\n') + '\n';
}

export function writeReport(r: CompletionReport, dir = 'eval/reports'): { md: string; json: string } {
  mkdirSync(dir, { recursive: true });
  const md = join(dir, 'completion-latest.md');
  const json = join(dir, 'completion-latest.json');
  writeFileSync(md, renderMarkdown(r));
  writeFileSync(json, JSON.stringify(r, null, 2) + '\n');
  return { md, json };
}
