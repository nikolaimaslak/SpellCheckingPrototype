import { describe, expect, it } from 'vitest';
import { postprocess } from '../../server/postprocess';
import { normalize } from '../../server/retrieval';

describe('postprocess', () => {
  it.each([
    ['removes repetition of the prefix', 'Thank you, your request', 'your request will be processed soon.', ' will be processed soon.'],
    ['cuts after the first sentence', 'Thank you, your request', ' will be processed. Anything else?', ' will be processed.'],
    ['cuts at a newline', 'Your request', 'will be processed\nThanks', ' will be processed'],
    ['strips quotes', 'Your request', '"will be processed."', ' will be processed.'],
    ['adds a leading space after a word', 'your request', 'will be processed.', ' will be processed.'],
    ['keeps no extra space after whitespace', 'your request ', 'will be processed.', 'will be processed.'],
    ['no space before punctuation', 'your request', ', thank you.', ', thank you.'],
    ['Arabic question mark terminates', 'هل تريد', 'معرفة حالة طلبك؟ يمكنني المساعدة', ' معرفة حالة طلبك؟'],
    ['Arabic continuation', 'تم استلام طلبك', 'وسيتم معالجته خلال ثلاثة أيام عمل.', ' وسيتم معالجته خلال ثلاثة أيام عمل.'],
  ])('%s', (_name, prefix, raw, expected) => {
    expect(postprocess(prefix, raw)).toBe(expected);
  });

  it('caps at 20 words', () => {
    const raw = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(postprocess('Your request', raw).trim().split(/\s+/)).toHaveLength(20);
  });

  it('rejects the wrong script', () => {
    expect(postprocess('تم استلام طلبك', 'and will be processed.')).toBe('');
    expect(postprocess('Your request', 'سيتم معالجته.')).toBe('');
  });

  it('returns empty for nothing useful', () => {
    expect(postprocess('Your request', '')).toBe('');
    expect(postprocess('Your request', '  ...  ')).toBe('');
    expect(postprocess('Your request', 'Your request')).toBe('');
  });
});

describe('postprocess: unfinished words', () => {
  const vocab = (...words: string[]) => {
    const known = new Set(words.map((w) => normalize(w)));
    return (w: string) => known.has(normalize(w));
  };
  const isWord = vocab('processed', 'request', 'form', 'استلام', 'طلبك');

  it('completes an unfinished word when the joined word is known', () => {
    expect(postprocess("It hasn't been proce", 'ssed yet, but it is under review.', isWord)).toBe('ssed yet, but it is under review.');
  });

  it('strips an echoed unfinished word', () => {
    expect(postprocess("It hasn't been proce", 'processed yet, but it is under review.', isWord)).toBe('ssed yet, but it is under review.');
    expect(postprocess("It hasn't been proce", 'processed yet, but it is under review.')).toBe('ssed yet, but it is under review.');
  });

  it('adds a space after a known word when the model left it out', () => {
    expect(postprocess('Thank you, your request', 'will be processed soon.', isWord)).toBe(' will be processed soon.');
  });

  it('keeps the space the model sent', () => {
    expect(postprocess('Please upload the form', ' today if possible.', isWord)).toBe(' today if possible.');
  });

  it('completes an Arabic unfinished word, comparing normalized forms', () => {
    expect(postprocess('تم استلا', 'م طلبك وسيتم معالجته', isWord)).toBe('م طلبك وسيتم معالجته');
  });

  it('joins when the unfinished part is not a known word and the model sent no space', () => {
    expect(postprocess('Use the Abshe', 'r app now.', vocab())).toBe('r app now.');
  });

  it('strips the whole unfinished word the model repeats, as the prompt asks', () => {
    expect(postprocess("If it weren't for the arcane name you could have be", 'been easily confused.', isWord)).toBe('en easily confused.');
  });

  it('does not treat a one-letter partial as an echo', () => {
    expect(postprocess('Thank you, I am a', 'about to check.')).toBe(' about to check.');
  });
});
