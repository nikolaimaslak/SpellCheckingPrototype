// Where a word sits in the agent's message, and what the customer wrote:
// context the auto-correct decision needs to leave people's names alone
// (formal Req 4.2.2). Pure; shared by the composer and the eval pipeline.
import { stripMarks } from '../spell/arabic';
import type { Lang } from '../spell/protocol';
import { languageOf } from '../tokenizer/tokenize';

// Titles and abbreviations whose full stop doesn't end a sentence ("Ms. Fatimah").
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'eng', 'st', 'jr', 'sr', 'vs', 'etc', 'e.g', 'i.e']);
const OPENERS = /[\s"'“‘«(\[]/u;
const TERMINATORS = /[.!?؟]/u;

/**
 * True when the word at `start` begins a sentence: at the start of the text,
 * after a line break, or after . ! ? ؟ and whitespace, unless that full stop
 * belongs to a title or abbreviation such as "Dr." or "e.g.".
 */
export function startsSentence(text: string, start: number): boolean {
  let i = start;
  let sawSpace = false;
  while (i > 0 && OPENERS.test(text[i - 1])) {
    if (text[i - 1] === '\n') return true;
    if (/\s/u.test(text[i - 1])) sawSpace = true;
    i--;
  }
  if (i === 0) return true;
  if (!sawSpace || !TERMINATORS.test(text[i - 1])) return false;
  if (text[i - 1] !== '.') return true;
  // The token before the full stop, e.g. "Ms" or "e.g".
  let j = i - 1;
  while (j > 0 && !/\s/u.test(text[j - 1])) j--;
  return !ABBREVIATIONS.has(text.slice(j, i - 1).toLowerCase());
}

const normalize = (word: string, lang: Lang) => (lang === 'ar' ? stripMarks(word) : word.toLowerCase());
const segmenter = new Intl.Segmenter('und', { granularity: 'word' });

/** The normalized words of the customer's turns (English lowercased, Arabic without marks). */
export function conversationWords(turns: readonly { role: string; text: string }[]): Set<string> {
  const words = new Set<string>();
  for (const turn of turns) {
    if (turn.role !== 'customer') continue;
    for (const seg of segmenter.segment(turn.text)) {
      if (!seg.isWordLike) continue;
      const lang = languageOf(seg.segment);
      if (lang) words.add(normalize(seg.segment, lang));
    }
  }
  return words;
}

/** True when the customer wrote this word. */
export const inConversation = (word: string, lang: Lang, words: ReadonlySet<string> | undefined) =>
  !!words?.has(normalize(word, lang));
