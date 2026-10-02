// Spans that are never spell checked. They are masked on the flat text before
// word segmentation: the segmenter would otherwise split "CS-104233" into a
// checkable "CS" plus digits, and pull "user.firstName" out of $(user.firstName).

const PATTERNS: { re: RegExp; trimTrailingPunctuation: boolean }[] = [
  { re: /\b(?:https?:\/\/|www\.)\S+/giu, trimTrailingPunctuation: true },
  { re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, trimTrailingPunctuation: false },
  { re: /\$\([^)]*\)/gu, trimTrailingPunctuation: false },
  // Any whitespace-delimited run containing a Western or Arabic-Indic digit.
  { re: /\S*\p{Nd}\S*/gu, trimTrailingPunctuation: true },
];

/** Returns `text` with every excluded span replaced by spaces of equal length. */
export function maskExclusions(text: string): string {
  const chars = text.split('');
  for (const { re, trimTrailingPunctuation } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const span = trimTrailingPunctuation ? m[0].replace(/\p{P}+$/u, '') : m[0];
      for (let i = m.index; i < m.index + span.length; i++) chars[i] = ' ';
    }
  }
  return chars.join('');
}
