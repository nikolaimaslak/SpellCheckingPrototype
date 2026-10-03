// npm run eval:words -- <input.txt|input.jsonl>... --out <list.tsv> [--lang en|ar] [--custom-words <file>]
// Builds a frequency-ranked list of correct words from correct text.
import { writeFileSync } from 'node:fs';
import { parseArgs, readMessages, readWordFile } from '../io.ts';
import { createPipeline } from '../pipeline.ts';
import { buildWordList, toTsv } from '../words.ts';
import type { Lang } from '../error-types.ts';

const { options, positional } = parseArgs(process.argv.slice(2));
if (!positional.length || typeof options.out !== 'string') {
  console.error('usage: npm run eval:words -- <input.txt|input.jsonl>... --out <list.tsv> [--lang en|ar] [--custom-words <file>]');
  process.exit(2);
}
const langs: Lang[] = options.lang === 'en' || options.lang === 'ar' ? [options.lang] : ['en', 'ar'];
const customWords = readWordFile(typeof options['custom-words'] === 'string' ? options['custom-words'] : 'eval/datasets/custom-words.txt');

const pipeline = await createPipeline({ customWords });
const texts = positional.flatMap((p) => readMessages(p).map((m) => m.text));
const { entries, rejected } = await buildWordList(pipeline, texts, langs);
writeFileSync(options.out, toTsv(entries));
console.log(`${options.out}: ${entries.length} words (${entries.reduce((n, e) => n + e.count, 0)} occurrences)`);
console.log(`left out: ${rejected.excluded} excluded, ${rejected['no-language']} without a single language, ${rejected.misspelled} misspelled`);
