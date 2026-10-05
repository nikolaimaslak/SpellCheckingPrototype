import type { Lang } from '../spell/protocol';

/**
 * Every string one edit away from `word`: one deletion, adjacent swap,
 * substitution or insertion, over `alphabet` plus the word's own letters.
 * Counted in code points so Arabic letters are single units. Deduplicated,
 * in generation order, without the word itself.
 */
export function oneEditVariants(word: string, alphabet: readonly string[]): string[] {
  const s = [...word];
  const letters = [...new Set([...alphabet, ...s])];
  const out = new Set<string>();
  const join = (parts: string[]) => parts.join('');
  for (let i = 0; i < s.length; i++) out.add(join([...s.slice(0, i), ...s.slice(i + 1)]));
  for (let i = 0; i + 1 < s.length; i++) out.add(join([...s.slice(0, i), s[i + 1], s[i], ...s.slice(i + 2)]));
  for (let i = 0; i < s.length; i++) {
    for (const c of letters) if (c !== s[i]) out.add(join([...s.slice(0, i), c, ...s.slice(i + 1)]));
  }
  for (let i = 0; i <= s.length; i++) {
    for (const c of letters) out.add(join([...s.slice(0, i), c, ...s.slice(i)]));
  }
  out.delete(word);
  out.delete('');
  return [...out];
}

/**
 * The letters a dictionary declares for suggestions (its .aff TRY line):
 * letters and the apostrophe only. English keeps lower case, since words are
 * compared in lower case; Arabic drops the harakat TRY lists, since words are
 * compared without diacritics.
 */
export function tryAlphabet(affText: string, lang: Lang): string[] {
  const line = affText.split(/\r?\n/).find((l) => /^TRY\s/.test(l));
  if (!line) return [];
  const chars = [...line.replace(/^TRY\s+/, '').trim()];
  return [...new Set(chars.filter((c) => (/\p{L}/u.test(c) || c === "'") && (lang !== 'en' || c === c.toLowerCase())))];
}
