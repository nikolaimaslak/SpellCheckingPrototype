// npm run eval:manifest [-- --write]: re-hashes the data files listed in
// eval/datasets/MANIFEST.json and reports changed, missing and unlisted files.
// --write records the new hashes; review the diff before committing it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest, sha256 } from '../datasets.ts';
import { parseArgs } from '../io.ts';

const { options } = parseArgs(process.argv.slice(2), ['write']);
const dir = 'eval/datasets';
const manifest = readManifest(dir);
let problems = 0;
for (const e of manifest.datasets) {
  const path = join(dir, e.file);
  if (!existsSync(path)) {
    console.log(`missing   ${path}`);
    problems++;
    continue;
  }
  const actual = sha256(readFileSync(path));
  if (actual !== e.sha256) {
    console.log(`changed   ${path}`);
    e.sha256 = actual;
    problems++;
  }
}
const listed = new Set(manifest.datasets.map((e) => e.file));
for (const f of readdirSync(dir).filter((f) => /\.(jsonl|tsv)$/.test(f) && !listed.has(f))) {
  console.log(`unlisted  ${join(dir, f)} (add an entry with its source and license)`);
  problems++;
}
if (options.write) {
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('hashes written to eval/datasets/MANIFEST.json');
} else if (problems) {
  console.log('run with --write to record the new hashes');
  process.exitCode = 1;
} else console.log('manifest up to date');
