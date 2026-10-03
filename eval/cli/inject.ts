// npm run eval:inject -- <input.txt|input.jsonl|words.tsv> --lang en|ar|en,ar --out <out.jsonl>
//   [--types hamza,dots,...] [--rate 0.08] [--per-word] [--seed 1] [--custom-words <file>]
// Inserts labelled misspellings into correct input. Writes the dataset and a
// sidecar <out>.meta.json with the options, seed and counts.
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { AR_TYPES, EN_TYPES, type EditType, type Lang } from '../error-types.ts';
import { GENERATOR_VERSION, injectMessages, injectWords } from '../inject.ts';
import { parseArgs, readMessages, readWordFile, toJsonl } from '../io.ts';
import { createPipeline } from '../pipeline.ts';
import { fromTsv } from '../words.ts';

const usage = () => {
  console.error(
    'usage: npm run eval:inject -- <input.txt|input.jsonl|words.tsv> --lang en|ar|en,ar --out <out.jsonl> [--types t1,t2] [--rate 0.08] [--per-word] [--seed 1] [--custom-words <file>]',
  );
  process.exit(2);
};

const { options, positional } = parseArgs(process.argv.slice(2), ['per-word']);
const [input] = positional;
if (!input || typeof options.out !== 'string' || typeof options.lang !== 'string') usage();
const out = options.out as string;
const langs = (options.lang as string).split(',') as Lang[];
if (!langs.every((l) => l === 'en' || l === 'ar')) usage();
const known = new Set<string>([...EN_TYPES, ...AR_TYPES]);
const types = typeof options.types === 'string' ? (options.types.split(',') as EditType[]) : undefined;
const unknown = types?.filter((t) => !known.has(t));
if (unknown?.length) {
  console.error(`unknown error types: ${unknown.join(', ')}`);
  process.exit(2);
}
const TYPES_OF = { en: EN_TYPES, ar: AR_TYPES } as const;
for (const lang of langs) {
  if (types && !types.some((t) => (TYPES_OF[lang] as readonly string[]).includes(t))) {
    console.error(`none of the selected types apply to ${lang}; its types are: ${TYPES_OF[lang].join(', ')}`);
    process.exit(2);
  }
}
const seed = Number(options.seed ?? 1);
const rate = Number(options.rate ?? 0.08);
const perWord = options['per-word'] === true;
const customFile = typeof options['custom-words'] === 'string' ? options['custom-words'] : 'eval/datasets/custom-words.txt';
const customWords = readWordFile(customFile);

const pipeline = await createPipeline({ customWords });
const injectOptions = { langs, types, rate, perWord, seed, customWords };
const result =
  extname(input) === '.tsv'
    ? await injectWords(pipeline, fromTsv(readFileSync(input, 'utf8')), injectOptions)
    : await injectMessages(pipeline, readMessages(input), injectOptions);

writeFileSync(out, toJsonl(result.messages));
const meta = {
  generator: 'eval/inject.ts',
  version: GENERATOR_VERSION,
  input,
  options: { lang: langs.join(','), types: types ?? 'all', rate: perWord ? null : rate, perWord, seed, customWords: customFile },
  stats: result.stats,
};
writeFileSync(out.replace(/\.jsonl$/, '') + '.meta.json', JSON.stringify(meta, null, 2) + '\n');
const total = Object.values(result.stats.inserted).reduce((a, b) => a + (b ?? 0), 0);
const discarded = Object.values(result.stats.realWord).reduce((a, b) => a + (b ?? 0), 0);
console.log(`${out}: ${result.messages.length} messages, ${total} errors inserted, ${discarded} real-word variants discarded`);
