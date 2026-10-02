import { stripMarks } from '../spell/arabic';
import type { Lang } from '../spell/protocol';
import { languageOf } from '../tokenizer';
import { osa } from './distance';

export interface DecideContext {
  /** `lang:word` keys the agent ignored or reverted this session. */
  ignored: ReadonlySet<string>;
  customWords: ReadonlySet<string>;
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
const isCapitalized = (w: string) => {
  const [first, ...rest] = [...w];
  return first !== first.toLowerCase() && rest.join('') === rest.join('').toLowerCase();
};
const capitalize = (w: string) => {
  const [first, ...rest] = [...w];
  return first.toUpperCase() + rest.join('');
};

/**
 * The auto-correction for a misspelled word, or null when it isn't a clear
 * slip: exactly one suggestion one edit away, long enough, same first letter
 * and script. Precision over recall — anything else stays a suggestion.
 */
export function decide(word: string, lang: Lang, suggestions: string[], ctx: DecideContext): string | null {
  if (ctx.ignored.has(`${lang}:${word}`) || ctx.customWords.has(word) || isAllCaps(word)) return null;
  const w = normalize(word, lang);
  if ([...w].length < MIN_LETTERS[lang]) return null;

  const candidates = suggestions.filter(
    (s) => !/\s/.test(s) && (word.includes('-') || !s.includes('-')) && languageOf(s) === lang,
  );
  const single = [...new Set(candidates.filter((s) => osa(w, normalize(s, lang)) === 1))];
  if (single.length !== 1) return null;

  const [fix] = single;
  if (firstLetter(w, lang) !== firstLetter(normalize(fix, lang), lang)) return null;
  return isCapitalized(word) ? capitalize(fix) : fix;
}
