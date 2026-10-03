// npm run eval:build: compiles every hand-marked source in eval/datasets/src/
// into eval/datasets/<name>.jsonl (see eval/build-datasets.ts for the markup).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { compileSource } from '../build-datasets.ts';
import { toJsonl } from '../io.ts';

for (const file of readdirSync('eval/datasets/src').filter((f) => f.endsWith('.txt')).sort()) {
  const name = basename(file, '.txt');
  const messages = compileSource(name, readFileSync(`eval/datasets/src/${file}`, 'utf8'));
  writeFileSync(`eval/datasets/${name}.jsonl`, toJsonl(messages));
  console.log(`eval/datasets/${name}.jsonl: ${messages.length} messages`);
}
