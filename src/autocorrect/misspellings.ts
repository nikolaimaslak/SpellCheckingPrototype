import { stripMarks } from '../spell/arabic';
import type { Lang } from '../spell/protocol';
import { parseList } from './list-checks';
import { AR_AYASPELL, AR_PROJECT } from './lists/ar';
import { EN_PROJECT } from './lists/en';

const toMap = (...texts: string[]) => new Map(texts.flatMap((t) => parseList(t).entries).map((e) => [e.typo, e.fix]));

const LISTS: Record<Lang, Map<string, string>> = {
  en: toMap(EN_PROJECT),
  ar: toMap(AR_AYASPELL, AR_PROJECT),
};

/**
 * The known fix for a common misspelling, or null. English matches a word in
 * lower case or with only its first letter capitalized ("teh", "Teh"; not
 * "tEh" or "TEH"), and returns the fix in lower case; the caller restores a
 * leading capital. Arabic matches after removing diacritics and tatweel.
 */
export function knownFix(word: string, lang: Lang, lists: Record<Lang, ReadonlyMap<string, string>> = LISTS): string | null {
  if (lang === 'ar') return lists.ar.get(stripMarks(word)) ?? null;
  const [first = '', ...rest] = [...word];
  const tail = rest.join('');
  if (tail !== tail.toLowerCase()) return null;
  return lists.en.get(first.toLowerCase() + tail) ?? null;
}

/** The parsed lists, for tests and tools. */
export const misspellingLists: Record<Lang, ReadonlyMap<string, string>> = LISTS;
