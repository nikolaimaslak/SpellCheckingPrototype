import { describe, expect, it } from 'vitest';
import type { CompletionCase } from '../../eval/completion/cases';
import { inventions, invariants, seamOk, spacingError } from '../../eval/completion/judge';

const kase = (prefix: string, seamWord?: string): CompletionCase => ({ id: 'x', lang: 'en', category: 'mid-word', prefix, ...(seamWord ? { seamWord } : {}) });

describe('seam word', () => {
  it('judges the word being typed', () => {
    const c = kase('Thank you for your pati', 'patience');
    expect(seamOk(c, 'ence.')).toBe(true);
    expect(seamOk(c, 'ent.')).toBe(false);
    expect(seamOk(c, ' ence.')).toBe(false);
    expect(seamOk(c, '')).toBeNull();
    expect(seamOk(kase('Thank you for your pati'), 'ence.')).toBeNull();
  });

  it('ignores letter case and Arabic diacritics', () => {
    expect(seamOk(kase('Before jumping into Ollam', 'Ollama'), 'a, I can help.')).toBe(true);
    const ar = kase('شكراً على صبرك، سأرسل لك التفا', 'التفاصيل');
    expect(seamOk(ar, 'صيل الآن.')).toBe(true);
    expect(seamOk(ar, 'صِيل الآن.')).toBe(true);
    expect(seamOk(ar, 'صل الآن.')).toBe(false);
  });

  it('keeps a finished word intact', () => {
    const c = kase('Thank you for contacting us', 'us');
    expect(seamOk(c, ', Sam.')).toBe(true);
    expect(seamOk(c, 'er.')).toBe(false);
  });
});

describe('spacing', () => {
  it('flags a space after a space and a letter after punctuation', () => {
    expect(spacingError('Thank you ', ' for waiting.')).toBe(true);
    expect(spacingError('Thank you ', 'for waiting.')).toBe(false);
    expect(spacingError('Thanks for waiting,', 'your order shipped.')).toBe(true);
    expect(spacingError('Thanks for waiting,', ' your order shipped.')).toBe(false);
    expect(spacingError('شكراً لانتظارك،', 'تم شحن طلبك.')).toBe(true);
    expect(spacingError('Thank you for your pati', 'ence.')).toBe(false);
  });
});

describe('invariants', () => {
  const c = kase('Thank you for your pati', 'patience');
  const edit = { typed: 'pati', word: 'patience', rest: '.' };

  it('pass for a well-formed reply', () => {
    expect(invariants(c, { completion: 'ence.', edit })).toEqual([]);
    expect(invariants(c, { completion: '', withheld: 'format' })).toEqual([]);
  });

  it('name each broken one', () => {
    expect(invariants(c, { completion: 'ence.', edit: { ...edit, rest: '!' } })).toEqual(['edit does not describe the completion']);
    expect(invariants(c, { completion: 'ence. More. Text.', edit: { ...edit, rest: '. More. Text.' } })).toEqual(['more than one sentence']);
    expect(invariants(kase('شكراً على'), { completion: ' your help.', edit: { typed: 'على', word: 'على', rest: ' your help.' } })).toEqual(['script en, prefix ar']);
    expect(invariants(c, { completion: 'ence.' })).toEqual(['no edit']);
  });

  it('accept an email after an Arabic prefix', () => {
    expect(invariants(kase('سنرسل التحديث إلى'), { completion: ' huda@example.com.', edit: { typed: 'إلى', word: 'إلى', rest: ' huda@example.com.' } })).toEqual([]);
  });
});

describe('inventions', () => {
  it('flags figures, emails and links missing from the context', () => {
    expect(inventions(' within 5 working days.', 'It takes 3 working days.')).toEqual(['5']);
    expect(inventions(' within 3 working days.', 'It takes 3 working days.')).toEqual([]);
    expect(inventions(' write to sam@example.com.', 'my email is sam@example.com')).toEqual([]);
    expect(inventions(' write to help@shop.com.', 'my email is sam@example.com')).toEqual(['help@shop.com']);
    expect(inventions(' see www.shop.com/help.', 'nothing')).toEqual(['www.shop.com/help']);
  });

  it('maps Arabic-Indic digits', () => {
    expect(inventions(' الطلب رقم ٧٧٣١', 'رقم الطلب 7731')).toEqual([]);
    expect(inventions(' الطلب رقم ٧٧٣٢', 'رقم الطلب 7731')).toEqual(['7732']);
  });

  it('flags a mustNotInvent detail absent from the context', () => {
    expect(inventions(' it will ship tomorrow.', 'order 58213', ['tomorrow'])).toEqual(['tomorrow']);
    expect(inventions(' it will ship tomorrow.', 'ships tomorrow', ['tomorrow'])).toEqual([]);
  });
});
