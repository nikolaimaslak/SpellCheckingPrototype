import { describe, expect, it } from 'vitest';
import { conversationWords, inConversation, startsSentence } from '../../src/autocorrect/context';

const at = (text: string, word: string) => startsSentence(text, text.indexOf(word));

describe('startsSentence', () => {
  it('is true at the start, after a line break and after a sentence end', () => {
    expect(at('Seperate forms', 'Seperate')).toBe(true);
    expect(at('Thanks.\nSeperate', 'Seperate')).toBe(true);
    expect(at('Thanks. Seperate', 'Seperate')).toBe(true);
    expect(at('Really! Seperate', 'Seperate')).toBe(true);
    expect(at('هل وصلك؟ Seperate', 'Seperate')).toBe(true);
    expect(at('"Seperate', 'Seperate')).toBe(true);
    expect(at('Done. "Seperate', 'Seperate')).toBe(true);
  });

  it('is false in mid-sentence, after titles and abbreviations, and inside compounds', () => {
    expect(at('Dear Fatimah', 'Fatimah')).toBe(false);
    expect(at('Dear Ms. Fatimah', 'Fatimah')).toBe(false);
    expect(at('ask Dr. Noura', 'Noura')).toBe(false);
    expect(at('forms, e.g. Seperate', 'Seperate')).toBe(false);
    expect(at('Dear Mr. Al-Harbi', 'Harbi')).toBe(false);
    expect(at('version 2.Seperate', 'Seperate')).toBe(false); // no whitespace after the full stop
  });
});

describe('conversation words', () => {
  const words = conversationWords([
    { role: 'customer', text: 'Hello, this is Noura' },
    { role: 'customer', text: 'معك نُوره من الرياض' },
    { role: 'agent', text: 'Welcome Fatimah' },
  ]);

  it('normalizes case and Arabic marks, from customer turns only', () => {
    expect(inConversation('Noura', 'en', words)).toBe(true);
    expect(inConversation('noura', 'en', words)).toBe(true);
    expect(inConversation('نوره', 'ar', words)).toBe(true);
    expect(inConversation('نُوره', 'ar', words)).toBe(true);
    expect(inConversation('Fatimah', 'en', words)).toBe(false);
    expect(inConversation('Noura', 'en', undefined)).toBe(false);
  });
});
