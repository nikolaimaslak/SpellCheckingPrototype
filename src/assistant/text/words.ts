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

export function lowercaseWordsIn(text: string): string[] {
  return (text.match(LETTERS) ?? []).map((word) => word.toLowerCase());
}

export function capitalizedWordsIn(text: string): string[] {
  return (text.match(LETTERS) ?? []).filter((word) => word[0] !== word[0].toLowerCase());
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export function directionOfLastWord(text: string): TextDirection {
  const lastWord = text.match(LETTERS)?.at(-1) ?? '';
  return /\p{Script=Arabic}/u.test(lastWord) ? 'rtl' : 'ltr';
}

export function scriptOf(text: string): 'arabic' | 'latin' | 'none' {
  const arabicLetters = text.match(/\p{Script=Arabic}/gu)?.length ?? 0;
  const latinLetters = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (arabicLetters > latinLetters) {
    return 'arabic';
  }
  return latinLetters ? 'latin' : 'none';
}

export function directionOfText(text: string): TextDirection {
  return scriptOf(text) === 'arabic' ? 'rtl' : 'ltr';
}
