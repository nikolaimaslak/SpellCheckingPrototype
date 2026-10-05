import { stripMarks } from '../spell/arabic';
import type { Lang } from '../spell/protocol';
import { inConversation } from './context';
import { knownFix } from './misspellings';

/** How aggressive auto-replace is (admin setting): only known misspellings, or also the general rules. */
export type AutoReplaceConfidence = 'list' | 'list-and-rule';

/** Which rule produced an auto-correction. */
export type FixSource = 'list' | 'case' | 'neighbor';

export interface Decision {
  fix: string;
  source: FixSource;
}

export interface DecideContext {
  /** `lang:word` keys the agent ignored or reverted this session. */
  ignored: ReadonlySet<string>;
  customWords: ReadonlySet<string>;
  /** Defaults to 'list-and-rule'. */
  confidence?: AutoReplaceConfidence;
  /** The word begins a sentence (context.ts startsSentence). Defaults to true. */
  startsSentence?: boolean;
  /** Normalized words of the customer's messages (context.ts conversationWords). */
  conversation?: ReadonlySet<string>;
}

/** What the engine says about a misspelled word, gathered by the caller. */
export interface DecideEvidence {
  /** Every dictionary word one edit away (the worker's neighbors request); may be empty when not needed. */
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

/** `fix` with a leading capital when `word` starts with one ("Teh" → "The"). */
export const withLeadingCapital = (word: string, fix: string) => (startsUpper(word) ? capitalize(fix) : fix);

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

/** True when the general rules need the engine's evidence for this word (the caller can skip the requests otherwise). */
export const needsEvidence = (word: string, lang: Lang, confidence: AutoReplaceConfidence = 'list-and-rule') =>
  confidence === 'list-and-rule' && knownFix(word, lang) === null;

/**
 * The auto-correction for a misspelled word and the rule that produced it, or
 * null when it isn't a clear slip. A known misspelling (the curated list)
 * comes first, whatever its length or neighbors; then, unless the admin
 * allows only the list, a case-only fix, or exactly one dictionary word one
 * edit away that starts with the same letter. Precision over recall: anything
 * else stays a suggestion. Deterministic: no engine ranking or time limit.
 */
export function decide(word: string, lang: Lang, evidence: DecideEvidence, ctx: DecideContext): Decision | null {
  if (ctx.ignored.has(`${lang}:${word}`) || ctx.customWords.has(word) || isAllCaps(word)) return null;
  // Names (Req 4.2.2): a capital in mid-sentence, or a word the customer wrote.
  if (startsUpper(word) && ctx.startsSentence === false) return null;
  if (inConversation(word, lang, ctx.conversation)) return null;
  const keepCapital = (fix: string) => withLeadingCapital(word, fix);

  const known = knownFix(word, lang);
  if (known) return { fix: keepCapital(known), source: 'list' };
  if ((ctx.confidence ?? 'list-and-rule') === 'list') return null;

  const w = normalize(word, lang);
  if ([...w].length < MIN_LETTERS[lang]) return null;

  // A stray capital: fix the case, never pick another word.
  if (evidence.caseFix) return { fix: evidence.caseFix, source: 'case' };

  if (evidence.neighbors.length !== 1) return null;
  const [fix] = evidence.neighbors;
  if (firstLetter(w, lang) !== firstLetter(normalize(fix, lang), lang)) return null;
  return { fix: keepCapital(fix), source: 'neighbor' };
}
