// Builds frequency-ranked lists of correct words from correct text. A word is
// listed only if the pipeline would check it and the engine accepts it, so a
// list is a safe base for inserting misspellings.
import { languageOf, maskExclusions } from '../src/tokenizer';
import { stripMarks, type Lang } from './error-types.ts';
import type { Pipeline } from './pipeline.ts';

export interface WordEntry {
  word: string;
  count: number;
  lang: Lang;
}

export interface WordListResult {
  entries: WordEntry[];
  /** Word-like spans left out, by reason. */
  rejected: { excluded: number; 'no-language': number; misspelled: number };
}

const segmenter = new Intl.Segmenter('und', { granularity: 'word' });

export async function buildWordList(pipeline: Pipeline, texts: string[], langs: Lang[] = ['en', 'ar']): Promise<WordListResult> {
  const counts = new Map<string, WordEntry>();
  const rejected = { excluded: 0, 'no-language': 0, misspelled: 0 };

  for (const text of texts) {
    const { tokens } = await pipeline.run(text);
    const byStart = new Map(tokens.map((t) => [t.start, t]));
    const masked = maskExclusions(text);
    for (const seg of segmenter.segment(text)) {
      if (!seg.isWordLike) continue;
      const token = byStart.get(seg.index);
      if (!token) {
        // The tokenizer didn't produce it: inside an excluded span, or no single language.
        if (masked[seg.index] === ' ' && text[seg.index] !== ' ') rejected.excluded++;
        else if (!languageOf(seg.segment)) rejected['no-language']++;
        continue;
      }
      if (!langs.includes(token.lang)) continue;
      if (token.flagged) {
        rejected.misspelled++;
        continue;
      }
      const word = token.lang === 'ar' ? stripMarks(token.word) : token.word;
      const key = `${token.lang}:${word}`;
      const entry = counts.get(key) ?? { word, count: 0, lang: token.lang };
      entry.count++;
      counts.set(key, entry);
    }
  }
  const entries = [...counts.values()].sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return { entries, rejected };
}

export const toTsv = (entries: WordEntry[]) => ['word\tcount\tlang', ...entries.map((e) => `${e.word}\t${e.count}\t${e.lang}`)].join('\n') + '\n';

export function fromTsv(tsv: string): WordEntry[] {
  const [header, ...rows] = tsv.trim().split('\n');
  if (header !== 'word\tcount\tlang') throw new Error('not a word list: expected the header "word<TAB>count<TAB>lang"');
  return rows.map((row) => {
    const [word, count, lang] = row.split('\t');
    if (!word || !(lang === 'en' || lang === 'ar') || !(Number(count) > 0)) throw new Error(`bad word list row: ${row}`);
    return { word, count: Number(count), lang };
  });
}
