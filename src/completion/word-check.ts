// Which word a suggestion would produce first, so the page can check it with
// the spelling engine before showing the suggestion: "be" + "n easily" would
// make "ben", a broken completion of "been".
import type { Lang } from '../spell/protocol';
import type { SpellService } from '../spell/service';
import { languageOf } from '../tokenizer/tokenize';

const TRAILING = /[\p{L}\p{N}\p{M}]+$/u;
const LEADING = /^[\p{L}\p{N}\p{M}]+/u;

export interface WordToCheck {
  word: string;
  lang: Lang;
  /** A new word (the suggestion starts after whitespace), not the end of the word being typed. */
  standalone: boolean;
}

/**
 * The first word the agent would end up with after accepting `suggestion`:
 * the unfinished word joined with the suggestion's first fragment when the
 * suggestion continues it, else the suggestion's first word. Null when the
 * suggestion starts with punctuation, or the word has no single language.
 */
export function firstWordToCheck(prefix: string, suggestion: string): WordToCheck | null {
  const lead = suggestion.match(LEADING)?.[0];
  const partial = prefix.match(TRAILING)?.[0];
  const standalone = !(lead && partial);
  const word = standalone ? suggestion.replace(/^\s+/u, '').match(LEADING)?.[0] : partial + lead;
  if (!word) return null;
  const lang = languageOf(word) ?? scriptOfLetter(word);
  return lang ? { word, lang, standalone } : null;
}

// languageOf() needs two letters; a lone letter still has a script.
const scriptOfLetter = (word: string): Lang | undefined =>
  [...word].length !== 1 ? undefined : /\p{Script=Arabic}/u.test(word) ? 'ar' : /\p{Script=Latin}/u.test(word) ? 'en' : undefined;

/** A lone English letter that can't start a new word ("be n easily"); "a" and "I" are words. */
export function strayLetter({ word, lang, standalone }: WordToCheck): boolean {
  return lang === 'en' && standalone && [...word].length === 1 && !/^[aAI]$/u.test(word);
}

/**
 * A completion `checkWord` backed by the page's spell service: true when the
 * engine accepts the word, false when it rejects it, undefined when no engine
 * is ready for that language (the suggestion is then shown unchecked).
 */
export function spellServiceCheck(service: () => SpellService | undefined) {
  return async (word: string, lang: Lang): Promise<boolean | undefined> => {
    const s = service();
    if (!s?.isReady(lang)) return undefined;
    await s.check({ [lang]: [word] });
    const misspelled = s.misspelled(lang, word);
    return misspelled === undefined ? undefined : !misspelled;
  };
}
