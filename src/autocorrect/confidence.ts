import { stripMarks } from '../spell/arabic';
import type { Lang } from '../spell/protocol';

export interface DecideContext {
  /** `lang:word` keys the agent ignored or reverted this session. */
  ignored: ReadonlySet<string>;
  customWords: ReadonlySet<string>;
}

/** What the engine says about a misspelled word, gathered by the caller. */
export interface DecideEvidence {
  /** Every dictionary word one edit away (the worker's neighbors request). */
  neighbors: readonly string[];
  /** caseFolded(word), when the engine accepts it; otherwise null. */
  caseFix: string | null;
}

const MIN_LETTERS: Record<Lang, number> = { en: 4, ar: 3 };
// For the first-letter test only: a missing or misplaced hamza on an initial
// alef is the most common Arabic slip, and its fix starts with a different form.
const ALEF = /^[اأإآ]/u;

const normalize = (w: string, lang: Lang) => (lang === 'ar' ? stripMarks(w) : w).toLowerCase();
const firstLetter = (w: string, lang: Lang) => {
  const c = [...w][0] ?? '';
  return lang === 'ar' && ALEF.test(c) ? 'ا' : c;
};
const isAllCaps = (w: string) => w !== w.toLowerCase() && w === w.toUpperCase();
const startsUpper = (w: string) => {
  const first = [...w][0] ?? '';
  return first !== first.toLowerCase();
};
const capitalize = (w: string) => {
  const [first = '', ...rest] = [...w];
  return first.toUpperCase() + rest.join('');
};

/**
 * The word with its first letter as typed and the rest in lower case, when
 * that differs from the word ("oNly" → "only", "ThiS" → "This"); null for
 * Arabic, which has no case. The caller asks the engine whether it is correct.
 */
export function caseFolded(word: string, lang: Lang): string | null {
  if (lang !== 'en') return null;
  const [first = '', ...rest] = [...word];
  const folded = first + rest.join('').toLowerCase();
  return folded === word ? null : folded;
}

/**
 * The auto-correction for a misspelled word, or null when it isn't a clear
 * slip. Either only the case is wrong, or exactly one dictionary word is one
 * edit away and starts with the same letter. Precision over recall: anything
 * else stays a suggestion. Deterministic: no engine ranking or time limit.
 */
export function decide(word: string, lang: Lang, evidence: DecideEvidence, ctx: DecideContext): string | null {
  if (ctx.ignored.has(`${lang}:${word}`) || ctx.customWords.has(word) || isAllCaps(word)) return null;
  const w = normalize(word, lang);
  if ([...w].length < MIN_LETTERS[lang]) return null;

  // A stray capital: fix the case, never pick another word.
  if (evidence.caseFix) return evidence.caseFix;

  if (evidence.neighbors.length !== 1) return null;
  const [fix] = evidence.neighbors;
  if (firstLetter(w, lang) !== firstLetter(normalize(fix, lang), lang)) return null;
  return startsUpper(word) ? capitalize(fix) : fix;
}
