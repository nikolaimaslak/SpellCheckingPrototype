import { maskExclusions } from './exclusions';
import { rangeFor, type TextMap } from './textmap';

export type Lang = 'en' | 'ar';

export interface Token {
  text: string;
  lang: Lang;
  /** Flat-text offsets, [start, end). */
  start: number;
  end: number;
  /** Live range over exactly this word; may span text nodes. */
  range: Range;
  /** The caret is inside the word or at its end: don't start a new check yet. */
  pending: boolean;
}

const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
const ARABIC = /^\p{Script=Arabic}+$/u;
const LATIN = /^\p{Script=Latin}+$/u;

/** Arabic or English by script; undefined for mixed script or fewer than two letters. */
export function languageOf(word: string): Lang | undefined {
  // Letters only: diacritics (\p{M}), tatweel and apostrophes don't decide script.
  const letters = word.replace(/[^\p{L}]/gu, '').replace(/ـ/g, '');
  if ([...letters].length < 2) return undefined;
  if (ARABIC.test(letters)) return 'ar';
  if (LATIN.test(letters)) return 'en';
  return undefined; // mixed script: excluded rather than guessed
}

/** Checkable word tokens of a composer's text, in document order. */
export function tokenize(map: TextMap, caret?: number): Token[] {
  const tokens: Token[] = [];
  for (const seg of segmenter.segment(maskExclusions(map.text))) {
    if (!seg.isWordLike) continue;
    const lang = languageOf(seg.segment);
    if (!lang) continue;
    const start = seg.index;
    const end = start + seg.segment.length;
    tokens.push({
      text: map.text.slice(start, end),
      lang,
      start,
      end,
      range: rangeFor(map, start, end),
      pending: caret !== undefined && start < caret && caret <= end,
    });
  }
  return tokens;
}
