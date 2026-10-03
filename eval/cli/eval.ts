// npm run eval            run the benchmark, write eval/reports/latest.{json,md}
// npm run eval:check      the same, then compare with eval/baseline.json; exits 1 on a regression
// npm run eval:baseline   the same, then write eval/baseline.json (review the diff before committing)
// Options: --quick (skip the run under CPU load), --matrix-words <n> (default 100)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runBenchmark } from '../benchmark.ts';
import { loadCriteria } from '../criteria.ts';
import { loadAll } from '../datasets.ts';
import { compare, toBaseline, type Baseline } from '../gate.ts';
import { parseArgs } from '../io.ts';
import { writeReports } from '../report.ts';

const BASELINE = 'eval/baseline.json';
const { options } = parseArgs(process.argv.slice(2), ['check', 'baseline', 'quick']);

const begin = performance.now();
const data = loadAll();
const criteria = loadCriteria();
const result = await runBenchmark(data, criteria, {
  matrixWords: options['matrix-words'] ? Number(options['matrix-words']) : undefined,
  skipLoadedRun: options.quick === true,
  log: (line) => console.log(line),
});
const { md } = writeReports(result);

console.log('');
for (const v of result.verdicts) {
  const mark = v.pass === null ? '–' : v.pass ? 'pass' : 'FAIL';
  console.log(`${mark.padEnd(4)}  ${v.criterion.gate ? '[gate] ' : ''}${v.criterion.label} (${v.criterion.lang}): ${v.value === null ? '–' : +v.value.toFixed(4)}`);
}
console.log(`\nreport: ${md} (${((performance.now() - begin) / 1000).toFixed(0)} s)`);

if (options.baseline) {
  writeFileSync(BASELINE, JSON.stringify(toBaseline(result), null, 2) + '\n');
  console.log(`baseline written to ${BASELINE}; review the diff before committing it`);
}

if (options.check) {
  if (!existsSync(BASELINE)) {
    console.error(`no ${BASELINE}: run npm run eval:baseline first`);
    process.exit(1);
  }
  const gate = compare(result, JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline, criteria);
  for (const line of gate.typeChanges) console.log(`type change  ${line}`);
  for (const line of gate.improvements) console.log(`improved     ${line}`);
  for (const line of gate.regressions) console.log(`REGRESSION   ${line}`);
  if (gate.regressions.length) {
    console.log(`\neval:check failed: ${gate.regressions.length} regression(s) against ${BASELINE}`);
    process.exit(1);
  }
  console.log(`\neval:check passed against ${BASELINE}`);
}
