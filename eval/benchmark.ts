// The spelling benchmark: every dataset through the composer's pipeline,
// three times as is and once while other threads load the CPU (KI-1), plus
// the error-type matrix. Metrics use, per token, the result at least two of
// the three unloaded runs agree on; decision instability counts tokens whose
// flag or auto-replacement differs in any run, suggestion instability those
// whose decision is stable but whose top suggestion differs. Private datasets only ever contribute aggregates.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { judge, type Criterion, type RunSummary, type Scope, type Verdict } from './criteria.ts';
import type { Dataset, LoadedData } from './datasets.ts';
import { TYPES, type ErrorType, type Lang } from './error-types.ts';
import { injectWords, type InjectStats } from './inject.ts';
import { byErrorType, bySource, computeMetrics, correctionTypes, groupBy, matrixRows, percentile, type CorrectionTypes, type FixSource, type MatrixRow, type Metrics, type SourceMetrics } from './metrics.ts';
import { outcomesFor } from './outcomes.ts';
import { createPipeline, type Pipeline } from './pipeline.ts';
import type { WordOutcome } from './types.ts';

export const RUNS = 3;
const LANGS: Lang[] = ['en', 'ar'];

export interface BenchmarkOptions {
  /** Words per language taken from the top of each word list for the matrix. */
  matrixWords?: number;
  matrixSeed?: number;
  /** Skip the run under CPU load (faster; instability then covers unloaded runs only). */
  skipLoadedRun?: boolean;
  log?: (line: string) => void;
}

export interface DatasetSummary {
  name: string;
  kind: string;
  lang: string;
  private: boolean;
  messages: number;
  metrics: Metrics;
  byType: Record<string, Metrics>;
  /** Gold misspellings per error type. */
  typeDistribution: Record<string, number>;
  correctionTypes: CorrectionTypes;
}

export interface MatrixSummary {
  words: number;
  seed: number;
  rows: MatrixRow[];
}

export interface UnstableToken {
  dataset: string;
  messageId: string;
  word: string;
  /** The result in each run: "<outcome> <top correction> <replacement>", or "absent". */
  runs: string[];
  context: string;
}

export interface Instability {
  total: number;
  byLang: Partial<Record<Lang | 'all', number>>;
  examples: UnstableToken[];
}

export interface BenchmarkResult {
  build: { version: string; commit: string; date: string };
  datasets: DatasetSummary[];
  summary: RunSummary;
  verdicts: Verdict[];
  byLang: Partial<Record<Lang, { metrics: Metrics; byType: Record<string, Metrics>; correctionTypes: CorrectionTypes; bySource?: Record<FixSource, SourceMetrics> }>>;
  matrix: Partial<Record<Lang, MatrixSummary>>;
  /** Flag or auto-replace decisions that differ between runs (the gated criterion). */
  instability: Instability;
  /** Stable decisions whose top suggestion differs between runs (reported, not gated). */
  suggestionInstability: Instability;
  examples: { corruptions: WordOutcome[]; wrongFixes: WordOutcome[]; exclusionLeaks: WordOutcome[] };
  /** Every corruption and wrong fix of the committed data, by language (uncapped), for the gate. */
  identities: Partial<Record<Lang, { corruptions: string[]; wrongFixes: string[] }>>;
  /** Engine time for one unloaded run, all committed data. */
  latency: RunSummary['latency'];
}

const EXAMPLE_CAP = 50;
const scopeOf = (kind: string): Scope | null => (kind === 'clean' ? 'clean' : kind === 'private' || kind === 'wordlist' ? null : 'misspelled');
const keyOf = (o: WordOutcome) => `${o.dataset}|${o.messageId}|${o.start}|${o.word}|${o.gold}`;
const resultOf = (o: WordOutcome | undefined) => (o ? `${o.outcome} ${o.corrections[0] ?? '-'} ${o.replacement ?? '-'}` : 'absent');
const decisionOf = (o: WordOutcome | undefined) => (o ? `${o.outcome} ${o.replacement ?? '-'}` : 'absent');

/**
 * Per token, the outcome at least two of the first `unloadedRuns` runs agree
 * on, and the tokens whose decision (flag, auto-replacement) or, with a stable
 * decision, top suggestion differs between any two runs. Examples leave out
 * private datasets.
 */
export function stabilityOf(
  runs: WordOutcome[][],
  privateNames: ReadonlySet<string>,
  unloadedRuns = RUNS,
): { outcomes: WordOutcome[]; decision: Instability; suggestion: Instability } {
  const indexed = runs.map((r) => new Map(r.map((o) => [keyOf(o), o])));
  const keys = [...new Set(runs.flatMap((r) => r.map(keyOf)))];
  const outcomes: WordOutcome[] = [];
  const empty = (): Instability => ({ total: 0, byLang: { en: 0, ar: 0, all: 0 }, examples: [] });
  const decision = empty();
  const suggestion = empty();
  const count = (into: Instability, perRun: (WordOutcome | undefined)[]) => {
    const any = perRun.find(Boolean)!;
    into.total++;
    into.byLang.all = (into.byLang.all ?? 0) + 1;
    if (any.lang) into.byLang[any.lang] = (into.byLang[any.lang] ?? 0) + 1;
    if (!privateNames.has(any.dataset) && into.examples.length < EXAMPLE_CAP) {
      into.examples.push({ dataset: any.dataset, messageId: any.messageId, word: any.word, runs: perRun.map(resultOf), context: any.context });
    }
  };
  for (const key of keys) {
    const perRun = indexed.map((m) => m.get(key));
    const results = perRun.map(resultOf);
    const unloaded = results.slice(0, unloadedRuns);
    const majority = unloaded.find((d) => unloaded.filter((x) => x === d).length >= 2) ?? unloaded[0];
    const chosen = perRun[results.indexOf(majority)];
    if (chosen) outcomes.push(chosen);
    if (new Set(perRun.map(decisionOf)).size > 1) count(decision, perRun);
    else if (new Set(results).size > 1) count(suggestion, perRun);
  }
  return { outcomes, decision, suggestion };
}

/** Keeps every available core busy until stopped (the KI-1 load). */
function loadCpu(): () => Promise<void> {
  const workers = Array.from({ length: availableParallelism() }, () => new Worker('for (;;) {}', { eval: true }));
  return async () => {
    await Promise.all(workers.map((w) => w.terminate()));
  };
}

function buildIdentity() {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // not a git checkout
  }
  return { version, commit, date: new Date().toISOString() };
}

/** An outcome that depends on suggestions, which can vary between runs. */
const volatile = (o: WordOutcome) => o.outcome !== 'untouched' && o.outcome !== 'excluded';

interface Timing {
  check: Partial<Record<Lang, number[]>>;
  suggest: Partial<Record<Lang, number[]>>;
  decide: Partial<Record<Lang, number[]>>;
}

/**
 * One pass over every dataset and the matrix variants. With `previous`, only
 * messages that had a flagged or changed word are evaluated again; the others
 * reuse their outcomes, since the correctness check is deterministic and only
 * suggestions (and so decisions) can vary between runs (KI-1).
 */
async function evaluateOnce(
  data: LoadedData,
  matrixInput: Map<Lang, { messages: Dataset['messages']; stats: InjectStats }>,
  pipelineFor: (custom: string[]) => Promise<Pipeline>,
  timing?: Timing,
  previous?: Map<string, WordOutcome[]>,
  record?: Map<string, WordOutcome[]>,
): Promise<WordOutcome[]> {
  const out: WordOutcome[] = [];
  const time = (lang: Lang, kind: keyof Timing, ms: number | null) => {
    if (timing && ms !== null) (timing[kind][lang] ??= []).push(ms);
  };
  const sets: { name: string; messages: Dataset['messages']; custom: string[] }[] = [
    ...data.datasets.map((d) => ({ name: d.name, messages: d.messages, custom: d.customWords })),
    ...[...matrixInput].map(([lang, m]) => ({ name: `matrix-${lang}`, messages: m.messages, custom: [] })),
  ];
  for (const set of sets) {
    const pipeline = await pipelineFor(set.custom);
    for (const message of set.messages) {
      const key = `${set.name}|${message.id}`;
      const before = previous?.get(key);
      if (before && !before.some(volatile)) {
        out.push(...before);
        continue;
      }
      const result = await pipeline.run(message.text);
      if (!set.name.startsWith('matrix-')) {
        for (const t of result.tokens) {
          time(t.lang, 'check', t.checkMs);
          time(t.lang, 'suggest', t.suggestMs);
          time(t.lang, 'decide', t.decideMs);
        }
      }
      const outcomes = outcomesFor(set.name, message, result);
      record?.set(key, outcomes);
      out.push(...outcomes);
    }
  }
  return out;
}

export async function runBenchmark(data: LoadedData, criteria: Criterion[], options: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  const log = options.log ?? (() => {});
  const matrixWords = options.matrixWords ?? 100;
  const matrixSeed = options.matrixSeed ?? 1;

  const pipelines = new Map<string, Promise<Pipeline>>();
  const pipelineFor = (custom: string[]) => {
    const key = [...custom].sort().join('\n');
    if (!pipelines.has(key)) pipelines.set(key, createPipeline({ customWords: custom }));
    return pipelines.get(key)!;
  };

  // Matrix variants are generated once, so every run sees the same words.
  const matrixInput = new Map<Lang, { messages: Dataset['messages']; stats: InjectStats }>();
  for (const lang of LANGS) {
    const list = data.wordLists.find((w) => w.entry.kind === 'wordlist' && w.entry.lang === lang);
    if (!list) continue;
    const words = list.words.slice(0, matrixWords).map((w) => ({ word: w.word, lang }));
    const { messages, stats } = await injectWords(await pipelineFor([]), words, { langs: [lang], perWord: true, seed: matrixSeed });
    matrixInput.set(lang, { messages: messages.map((m) => ({ ...m, id: `${m.id}` })), stats });
    log(`matrix ${lang}: ${messages.length} variants from ${words.length} words`);
  }

  // Warm up the engines so the first measured calls aren't penalized.
  for (const p of pipelines.values()) await (await p).run('warm up the engine تهيئة المحرك');

  const runs: WordOutcome[][] = [];
  const timing: Timing = { check: {}, suggest: {}, decide: {} };
  const first = new Map<string, WordOutcome[]>();
  for (let i = 0; i < RUNS; i++) {
    const begin = performance.now();
    runs.push(await evaluateOnce(data, matrixInput, pipelineFor, i === 0 ? timing : undefined, i === 0 ? undefined : first, i === 0 ? first : undefined));
    log(`run ${i + 1}/${RUNS}: ${runs[i].length} outcomes in ${((performance.now() - begin) / 1000).toFixed(1)} s`);
  }
  if (!options.skipLoadedRun) {
    const stop = loadCpu();
    const begin = performance.now();
    try {
      runs.push(await evaluateOnce(data, matrixInput, pipelineFor, undefined, first));
    } finally {
      await stop();
    }
    log(`run under CPU load: ${((performance.now() - begin) / 1000).toFixed(1)} s`);
  }

  // Majority result per token over the unloaded runs; instability over all runs.
  const privateNames = new Set(data.datasets.filter((d) => d.entry.kind === 'private').map((d) => d.name));
  const { outcomes, decision, suggestion } = stabilityOf(runs, privateNames);

  const datasetOutcomes = groupBy(outcomes, (o) => o.dataset);
  const summaries: DatasetSummary[] = data.datasets.map((d) => {
    const own = datasetOutcomes.get(d.name) ?? [];
    const typeDistribution: Record<string, number> = {};
    for (const o of own) if (o.gold === 'misspelled') typeDistribution[o.errorType ?? 'unknown'] = (typeDistribution[o.errorType ?? 'unknown'] ?? 0) + 1;
    return {
      name: d.name,
      kind: d.entry.kind,
      lang: d.entry.lang,
      private: d.entry.kind === 'private',
      messages: d.messages.length,
      metrics: computeMetrics(own),
      byType: Object.fromEntries(byErrorType(own)),
      typeDistribution,
      correctionTypes: correctionTypes(own),
    };
  });

  // Criteria and examples use committed datasets only.
  const kindOf = new Map(data.datasets.map((d) => [d.name, d.entry.kind]));
  const committed = outcomes.filter((o) => kindOf.has(o.dataset) && !privateNames.has(o.dataset));
  const scopes: RunSummary['scopes'] = { clean: {}, misspelled: {}, all: {} };
  for (const scope of ['clean', 'misspelled', 'all'] as const) {
    const inScope = committed.filter((o) => scope === 'all' || scopeOf(kindOf.get(o.dataset)!) === scope);
    scopes[scope].all = computeMetrics(inScope);
    for (const lang of LANGS) scopes[scope][lang] = computeMetrics(inScope.filter((o) => o.lang === lang));
  }
  const latency: RunSummary['latency'] = {};
  for (const lang of [...LANGS, 'all'] as const) {
    const check = lang === 'all' ? LANGS.flatMap((l) => timing.check[l] ?? []) : (timing.check[lang] ?? []);
    const suggest = lang === 'all' ? LANGS.flatMap((l) => timing.suggest[l] ?? []) : (timing.suggest[lang] ?? []);
    const decide = lang === 'all' ? LANGS.flatMap((l) => timing.decide[l] ?? []) : (timing.decide[lang] ?? []);
    latency[lang] = { checkP95Ms: percentile(check, 95), suggestP95Ms: percentile(suggest, 95), decideP95Ms: percentile(decide, 95) };
  }
  const summary: RunSummary = { scopes, instability: decision.byLang, latency };

  const matrix: BenchmarkResult['matrix'] = {};
  for (const [lang, m] of matrixInput) {
    const own = (datasetOutcomes.get(`matrix-${lang}`) ?? []) as WordOutcome[];
    matrix[lang] = { words: Math.min(matrixWords, data.wordLists.find((w) => w.entry.lang === lang)?.words.length ?? 0), seed: matrixSeed, rows: matrixRows(TYPES[lang] as ErrorType[], own, m.stats) };
  }

  const byLang: BenchmarkResult['byLang'] = {};
  for (const lang of LANGS) {
    const own = committed.filter((o) => o.lang === lang);
    byLang[lang] = { metrics: computeMetrics(own), byType: Object.fromEntries(byErrorType(own)), correctionTypes: correctionTypes(own), bySource: bySource(own) };
  }

  return {
    build: buildIdentity(),
    datasets: summaries,
    summary,
    verdicts: judge(criteria, summary),
    byLang,
    matrix,
    instability: decision,
    suggestionInstability: suggestion,
    examples: {
      corruptions: committed.filter((o) => o.outcome === 'corruption').slice(0, EXAMPLE_CAP),
      wrongFixes: committed.filter((o) => o.outcome === 'wrong-fix').slice(0, EXAMPLE_CAP),
      exclusionLeaks: committed.filter((o) => o.outcome === 'exclusion-leak').slice(0, EXAMPLE_CAP),
    },
    identities: Object.fromEntries(
      LANGS.map((lang) => [
        lang,
        {
          corruptions: committed.filter((o) => o.lang === lang && o.outcome === 'corruption').map(identity),
          wrongFixes: committed.filter((o) => o.lang === lang && o.outcome === 'wrong-fix').map(identity),
        },
      ]),
    ),
    latency,
  };
}

/** A stable name for a corruption or wrong fix, as the gate prints it. */
export const identity = (o: WordOutcome) => `${o.dataset} ${o.messageId} "${o.word}"${o.replacement ? ` → "${o.replacement}"` : ''}`;
