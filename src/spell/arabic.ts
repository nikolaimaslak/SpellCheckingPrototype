// Tashkeel (harakat, tanwin, shadda, sukun, superscript alef, Quranic marks)
// and tatweel. Hamza and alef variants are deliberately NOT folded: a missing
// or wrong hamza is a common real error that folding would silently accept.
const MARKS = /[ً-ٰٟۖ-ۭـ]/g;

/** Removes Arabic diacritics and tatweel; leaves every letter as written. */
export function stripMarks(word: string): string {
  return word.replace(MARKS, '');
}
