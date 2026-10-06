// Completion benchmark (openspec/specs/completion-eval): every case of
// eval/completion/cases.jsonl, sampled N times through the real completion
// service with the server's model selection.
//
//   npm run eval:completion [-- --samples 5 --concurrency 4]
//   npm run eval:completion:check      compare with eval/completion/baseline.json (exit 1 on regression)
//   npm run eval:completion:baseline   rewrite the baseline
//   npm run eval:completion:record     also rewrite the model's recordings (the replay suite's input)
//
// --allow-fake runs with the offline test model (for testing this tool only).
// --reports-dir, --recordings-dir and --baseline-file redirect the outputs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { selectModel } from '../../server/model-select.ts';
import type { CompletionModel } from '../../server/types.ts';
import { loadCases, type CompletionCase } from '../completion/cases.ts';
import { loadCriteria, verdicts } from '../completion/criteria.ts';
import { BASELINE_PATH, gate, toBaseline, type Baseline, type GateResult } from '../completion/gate.ts';
import { metricsTable, summarizeCase, type CaseResult, type Sample } from '../completion/metrics.ts';
import { RECORDINGS_DIR, writeRecordings, type Recording } from '../completion/recording.ts';
import { writeReport } from '../completion/report.ts';
import { loadServerData, runCase, type CaseRun } from '../completion/run.ts';
import { parseArgs } from '../io.ts';

// Same minimal .env loader as server/main.ts: KEY=value lines; real environment variables win.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const { options } = parseArgs(process.argv.slice(2), ['check', 'baseline', 'record', 'allow-fake']);
const samples = Number(options.samples ?? 5);
const concurrency = Number(options.concurrency ?? 4);
if (!Number.isInteger(samples) || samples < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
  console.error('--samples and --concurrency must be positive integers');
  process.exit(2);
}

const { model } = selectModel(process.env);
if (!model || (model.name === 'fake' && !options['allow-fake'])) {
  console.error('The completion benchmark needs a live model: set GEMINI_API_KEY (in .env or the environment). Use --allow-fake only to test this tool.');
  process.exit(2);
}

const dataset = loadCases();
const data = loadServerData();
const criteria = loadCriteria();

/** Runs fn over items with at most `limit` in flight, keeping the order of results. */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function sample(c: CompletionCase, m: CompletionModel): Promise<CaseRun> {
  try {
    return await runCase(c, m, data);
  } catch (err) {
    return { reply: null, user: '', ms: 0, error: (err as Error).message };
  }
}

const jobs = dataset.cases.flatMap((c) => Array.from({ length: samples }, (_, i) => ({ c, i })));
let done = 0;
const started = performance.now();
const runs = await pool(jobs, concurrency, async ({ c }) => {
  const r = await sample(c, model);
  if (++done % 20 === 0 || done === jobs.length) process.stderr.write(`\r${done}/${jobs.length} samples`);
  return r;
});
process.stderr.write(`\r${jobs.length} samples in ${Math.round((performance.now() - started) / 1000)} s\n`);

const results: CaseResult[] = dataset.cases.map((c, ci) => ({
  case: c,
  samples: runs.slice(ci * samples, (ci + 1) * samples).map((r): Sample => ({ reply: r.reply, user: r.user, ms: r.ms, ...(r.error ? { error: r.error } : {}) })),
}));
const table = metricsTable(results);
const vs = verdicts(criteria, table);
const runInfo = { model: model.name, datasetHash: dataset.hash, samples, verdicts: vs };

if (options.record) {
  const recordings: Recording[] = [];
  const missing: string[] = [];
  dataset.cases.forEach((c, ci) => {
    const first = runs.slice(ci * samples, (ci + 1) * samples).find((r) => r.reply && r.raw !== undefined);
    if (first) recordings.push({ case: c.id, key: first.key!, raw: first.raw!, reply: first.reply! });
    else missing.push(c.id);
  });
  const path = writeRecordings(model.name, recordings, (options['recordings-dir'] as string) ?? RECORDINGS_DIR);
  console.log(`recordings: ${recordings.length} cases → ${path}${missing.length ? ` (no answer for: ${missing.join(', ')})` : ''}`);
}

const baselineFile = (options['baseline-file'] as string) ?? BASELINE_PATH;
let baseline: Baseline | null = existsSync(baselineFile) ? (JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline) : null;
let result: GateResult | null = null;
if (options.check) {
  result = baseline ? gate(runInfo, baseline) : { refused: `no baseline at ${baselineFile}: run npm run eval:completion:baseline`, regressions: [], improvements: [] };
}
if (options.baseline) {
  baseline = toBaseline(runInfo);
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`baseline → ${baselineFile}`);
}

const report = writeReport(
  {
    model: model.name,
    date: new Date().toISOString(),
    samples,
    datasetHash: dataset.hash,
    cases: dataset.cases.length,
    verdicts: vs,
    table,
    caseSummaries: results.map(summarizeCase),
    baseline,
    gate: result,
  },
  (options['reports-dir'] as string) ?? 'eval/reports',
);

const all = table.byColumn.all;
const p = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);
console.log(`${model.name}: shown ${p(all.shownRate)}, format ${p(all.formatRate)}, errors ${p(all.errorRate)}, seam ${p(all.seamAccuracy)}, spacing ${p(all.spacingErrorRate)}, inventions ${p(all.inventionRate)}, agreement ${p(all.shownAgreement)}, p50 ${all.p50Ms === null ? '–' : Math.round(all.p50Ms)} ms, p95 ${all.p95Ms === null ? '–' : Math.round(all.p95Ms)} ms`);
console.log(`report → ${report.md}`);
if (result) {
  if (result.refused) console.log(`gate: not compared: ${result.refused}`);
  else if (result.regressions.length) console.log(`gate: FAIL\n${result.regressions.map((x) => `  - ${x}`).join('\n')}`);
  else console.log('gate: pass');
  for (const x of result.improvements) console.log(`  + ${x}`);
  if (result.refused || result.regressions.length) process.exit(1);
}
