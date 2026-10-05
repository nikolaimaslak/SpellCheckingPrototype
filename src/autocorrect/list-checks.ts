// Checks a misspellings-list entry must pass (openspec/specs/misspellings-list).
// Pure: the caller supplies the engine's correctness check, so the same code
// runs in tests on the real engine and in scripts/extract-ayaspell-rep.ts.
import type { Lang } from '../spell/protocol';
import { languageOf } from '../tokenizer/tokenize';

export interface ListEntry {
  typo: string;
  fix: string;
  /** Arabic: alef-form spellings the dictionary accepts that a reviewer judged not plausible fixes. */
  notPlausible?: string[];
}

export interface ParsedList {
  entries: ListEntry[];
  /** Misspelled words listed more than once. */
  duplicates: string[];
  /** Lines that are neither a comment nor `typo<TAB>fix[<TAB>not: …]`. */
  malformed: string[];
}

/**
 * `typo<TAB>fix` lines, optionally with a third column `not: <spelling> …`
 * acknowledging alternatives that aren't plausible fixes. Blank lines and
 * `#` comments are skipped.
 */
export function parseList(text: string): ParsedList {
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const malformed: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t').map((p) => p.trim());
    const ack = parts[2] === undefined ? [] : /^not:\s*(.+)$/u.exec(parts[2])?.[1].split(/\s+/u);
    if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1] || !ack) {
      malformed.push(line);
      continue;
    }
    const typo = parts[0];
    if (seen.has(typo)) duplicates.push(typo);
    seen.add(typo);
    entries.push(ack.length ? { typo, fix: parts[1], notPlausible: ack } : { typo, fix: parts[1] });
  }
  return { entries, duplicates, malformed };
}

const ALEFS = ['ا', 'أ', 'إ', 'آ'];

/** Every spelling of `word` with its alef letters (ا أ إ آ) swapped among themselves, without `word` itself. */
export function alefForms(word: string): string[] {
  let forms = [''];
  for (const c of word) {
    const options = ALEFS.includes(c) ? ALEFS : [c];
    forms = forms.flatMap((f) => options.map((o) => f + o));
  }
  return forms.filter((f) => f !== word);
}

/**
 * The checks an entry fails, by name; empty when it passes. `isCorrect`
 * answers as the engine does (Arabic: diacritics and tatweel ignored).
 */
export function checkEntry(
  entry: ListEntry,
  lang: Lang,
  isCorrect: (word: string) => boolean,
  customWords: ReadonlySet<string> = new Set(),
): string[] {
  const { typo, fix } = entry;
  const failures: string[] = [];
  if (/\s/u.test(typo) || /\s/u.test(fix)) failures.push('not a single word');
  if (typo === fix) failures.push('typo and fix are the same');
  if (languageOf(typo) !== lang || languageOf(fix) !== lang) failures.push(`not ${lang} script`);
  if (lang === 'en' && [...typo].length < 3) failures.push('fewer than 3 letters');
  if (customWords.has(typo)) failures.push('custom dictionary word');
  if (isCorrect(typo)) failures.push('typo is accepted by the dictionary');
  if (!isCorrect(fix)) failures.push('fix is rejected by the dictionary');
  const acknowledged = entry.notPlausible ?? [];
  if (lang === 'ar') {
    const others = alefForms(typo).filter((f) => f !== fix && isCorrect(f));
    const unacknowledged = others.filter((f) => !acknowledged.includes(f));
    const stale = acknowledged.filter((f) => !others.includes(f));
    if (unacknowledged.length) failures.push(`other alef forms are words: ${unacknowledged.join(', ')}`);
    if (stale.length) failures.push(`stale acknowledgement: ${stale.join(', ')}`);
  } else if (acknowledged.length) {
    failures.push('acknowledgements only apply to Arabic');
  }
  return failures;
}
