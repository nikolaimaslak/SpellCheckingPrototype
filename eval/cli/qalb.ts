// npm run eval:qalb -- <areta-file> --name <name> --source <provenance> --license <license name>
//   --license-file <corpus license> [--limit N]
// Converts an ARETA-tagged alignment file (CAMeL Lab arabic-gec release) into
// a private spelling dataset in eval/datasets/private/, with the corpus
// license beside it and an entry in the private manifest. Evaluation only:
// see docs/EVALUATION.md for the license terms.
import { readFileSync } from 'node:fs';
import { parseArgs } from '../io.ts';
import { tokensOf } from '../pipeline.ts';
import { convert, writePrivate } from '../qalb.ts';

const PRIVATE = 'eval/datasets/private';

const usage = () => {
  console.error('usage: npm run eval:qalb -- <areta-file> --name <name> --source <provenance> --license <license name> --license-file <path> [--limit N]');
  process.exit(2);
};

const { options, positional } = parseArgs(process.argv.slice(2));
const [input] = positional;
const str = (k: string) => (typeof options[k] === 'string' ? (options[k] as string) : undefined);
const name = str('name');
const source = str('source');
const license = str('license');
const licenseFile = str('license-file');
if (!input || !name || !source || !license || !licenseFile) usage();
const limit = str('limit') ? Number(str('limit')) : undefined;
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) usage();

try {
  const { messages, counts } = convert(readFileSync(input!, 'utf8'), name!, (text) => tokensOf(text), limit);
  const { data } = writePrivate(messages, { dir: PRIVATE, name: name!, input: input!, source: source!, license: license!, licenseFile: licenseFile!, limit });
  console.log(`eval:qalb: ${data}`);
  console.log(
    `  ${counts.messages} messages; words: ${counts.correct} correct, ${counts.misspelled} misspelled, ${counts.unscored} unscored; ` +
      `${counts.dropped} labels dropped (words the tokenizer doesn't check); ${counts.skipped} sentences skipped`,
  );
  console.log('  Private and licensed: evaluation only, never commit it or build lists from it.');
} catch (err) {
  console.error(`eval:qalb: ${(err as Error).message}`);
  process.exit(1);
}
