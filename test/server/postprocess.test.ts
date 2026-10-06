import { describe, expect, it } from 'vitest';
import { assemble, finalize, parseStructured, type Structured } from '../../server/postprocess';

/** assemble + finalize, as complete.ts runs them; 'format' or the final completion. */
const build = (prefix: string, s: Structured) => {
  const a = assemble(prefix, s);
  return a === 'format' ? 'format' : finalize(prefix, a.completion);
};

describe('parseStructured', () => {
  it('reads word and rest', () => {
    expect(parseStructured('{"word":"Ollama","rest":", I can help you."}')).toEqual({ word: 'Ollama', rest: ', I can help you.' });
  });

  it('rejects invalid JSON or the wrong shape', () => {
    for (const raw of ['', ' n easily confused.', '{"word":"been"}', '{"word":1,"rest":""}', '["been",""]', 'null']) expect(parseStructured(raw), raw).toBeNull();
  });
});

describe('assemble: unfinished words', () => {
  it('completes an unfinished word', () => {
    expect(assemble("It hasn't been proce", { word: 'processed', rest: ' yet, but it is under review.' })).toEqual({
      completion: 'ssed yet, but it is under review.',
      edit: { typed: 'proce', word: 'processed', rest: ' yet, but it is under review.' },
    });
  });

  it('ignores letter case and keeps the agent’s letters', () => {
    expect(build("It hasn't been proce", { word: 'Processed', rest: ' yet.' })).toBe('ssed yet.');
  });

  it('completes the whole word the model repeats', () => {
    expect(build("If it weren't for the arcane name you could have be", { word: 'been', rest: ' easily confused.' })).toBe('en easily confused.');
  });

  it('completes a word no dictionary knows', () => {
    expect(build('Use the Abshe', { word: 'Absher', rest: ' app now.' })).toBe('r app now.');
    expect(build('Before jumping into Ollam', { word: 'Ollama', rest: ', I can help you.' })).toBe('a, I can help you.');
  });

  it('completes an Arabic unfinished word', () => {
    expect(build('تم استلا', { word: 'استلام', rest: ' طلبك وسيتم معالجته' })).toBe('م طلبك وسيتم معالجته');
  });

  it('continues after a finished word the model repeats in full', () => {
    expect(build('Thank you, your request', { word: 'request', rest: ' will be processed soon.' })).toBe(' will be processed soon.');
  });

  it('withholds a word that does not extend what was typed', () => {
    const prefix = "If it weren't for the arcane name you could have be";
    expect(assemble(prefix, { word: 'seen', rest: ' helpful.' })).toBe('format');
    expect(assemble(prefix, { word: '', rest: ' n easily confused.' })).toBe('format');
    expect(assemble('Your request', { word: 'request', rest: '' })).toBe('format');
  });
});

describe('assemble: new words', () => {
  it('adds nothing after a space', () => {
    expect(assemble('Thank you, your request ', { word: '', rest: 'will be processed soon.' })).toEqual({
      completion: 'will be processed soon.',
      edit: { typed: '', word: '', rest: 'will be processed soon.' },
    });
  });

  it('adds a space after punctuation', () => {
    expect(build('Please upload the form,', { word: '', rest: 'today if possible.' })).toBe(' today if possible.');
    expect(build('Please upload the form,', { word: 'today', rest: ' if possible.' })).toBe(' today if possible.');
  });

  it('adds no space before punctuation', () => {
    expect(build('Please upload the form.', { word: '', rest: '..' })).toBe('');
  });
});

describe('finalize', () => {
  it.each([
    ['cuts after the first sentence', 'Thank you, your request', ' will be processed. Anything else?', ' will be processed.'],
    ['cuts at a newline', 'Your request ', 'will be processed\nThanks', 'will be processed'],
    ['removes a restated prefix tail', 'Thank you, your request ', 'your request will be processed.', 'will be processed.'],
    ['removes a restated tail after punctuation', 'Thank you,', ' Thank you, your request is received.', ' your request is received.'],
    ['Arabic question mark terminates', 'هل تريد ', 'معرفة حالة طلبك؟ يمكنني المساعدة', 'معرفة حالة طلبك؟'],
    ['keeps a mid-word join', 'تم استلا', 'م طلبك وسيتم معالجته.', 'م طلبك وسيتم معالجته.'],
  ])('%s', (_name, prefix, completion, expected) => {
    expect(finalize(prefix, completion)).toBe(expected);
  });

  it('caps at 20 words', () => {
    const rest = ' ' + Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const out = build('Your request', { word: 'request', rest });
    expect(out).toMatch(/^ w0/);
    expect((out as string).trim().split(/\s+/)).toHaveLength(20);
  });

  it('rejects the wrong script', () => {
    expect(build('تم استلام طلبك', { word: 'طلبك', rest: ' and will be processed.' })).toBe('');
    expect(build('Your request ', { word: '', rest: 'سيتم معالجته.' })).toBe('');
  });

  it('returns empty for nothing useful', () => {
    expect(finalize('Your request', '')).toBe('');
    expect(finalize('Your request', ' ...  ')).toBe('');
  });
});
