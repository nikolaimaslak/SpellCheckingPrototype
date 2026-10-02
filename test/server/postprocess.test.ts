import { describe, expect, it } from 'vitest';
import { postprocess } from '../../server/postprocess';

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
