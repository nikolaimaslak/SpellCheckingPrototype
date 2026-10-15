import type { TextDirection } from '../types';

export interface WordPlace {
  word: string;
  start: number;
  end: number;
}

const LETTERS = /[\p{L}\p{M}]+/gu;
const escapeForRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findWordPlaces(text: string, words: Iterable<string>): WordPlace[] {
  const places: WordPlace[] = [];
  for (const word of words) {
    const wholeWord = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeForRegExp(word)}(?![\\p{L}\\p{M}\\p{N}])`, 'gu');
    for (const match of text.matchAll(wholeWord)) places.push({ word, start: match.index, end: match.index + word.length });
  }
  return places.sort((first, second) => first.start - second.start);
}

export function directionOfLastWord(text: string): TextDirection {
  const lastWord = text.match(LETTERS)?.at(-1) ?? '';
  return /\p{Script=Arabic}/u.test(lastWord) ? 'rtl' : 'ltr';
}

export function directionOfText(text: string): TextDirection {
  const arabicLetters = text.match(/\p{Script=Arabic}/gu)?.length ?? 0;
  const latinLetters = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return arabicLetters > latinLetters ? 'rtl' : 'ltr';
}
