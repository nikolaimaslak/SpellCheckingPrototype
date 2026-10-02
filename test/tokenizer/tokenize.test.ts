// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildTextMap, tokenize } from '../../src/tokenizer';

const tokensOf = (html: string, caret?: number) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.replaceChildren(div);
  return tokenize(buildTextMap(div), caret);
};
const words = (html: string) => tokensOf(html).map((t) => t.text);

describe('tokenize', () => {
  it('English sentence, with ranges matching each token', () => {
    const tokens = tokensOf('Thank you for contacting us');
    expect(tokens.map((t) => t.text)).toEqual(['Thank', 'you', 'for', 'contacting', 'us']);
    for (const t of tokens) expect(t.range.toString()).toBe(t.text);
    expect(tokens.every((t) => t.lang === 'en')).toBe(true);
  });

  it('word split by formatting is one token spanning both nodes', () => {
    const [t] = tokensOf('<b>rec</b>eive');
    expect(t.text).toBe('receive');
    expect(t.range.toString()).toBe('receive');
  });

  it('line breaks, emoji and inline images are boundaries', () => {
    expect(words('hello<br>world')).toEqual(['hello', 'world']);
    expect(words('thanks😊please')).toEqual(['thanks', 'please']);
    expect(words('word<img alt="x">next')).toEqual(['word', 'next']);
  });

  it('contractions stay whole', () => {
    expect(words("don't")).toEqual(["don't"]);
  });

  it('Arabic sentence without punctuation in tokens', () => {
    const tokens = tokensOf('مرحبا، كيف يمكنني مساعدتك؟');
    expect(tokens.map((t) => t.text)).toEqual(['مرحبا', 'كيف', 'يمكنني', 'مساعدتك']);
    expect(tokens.every((t) => t.lang === 'ar')).toBe(true);
  });

  it('attached clitics stay one token', () => {
    expect(words('والكتاب بالمدرسة')).toEqual(['والكتاب', 'بالمدرسة']);
  });

  it('diacritics and tatweel stay inside the token', () => {
    const [vowelled] = tokensOf('مَرْحَبًا');
    expect(vowelled.text).toBe('مَرْحَبًا');
    expect(vowelled.range.toString()).toBe('مَرْحَبًا');
    expect(words('مرحـــبا')).toEqual(['مرحـــبا']);
  });

  it('mixed sentence routes each word by script', () => {
    const tokens = tokensOf('رقم الطلب في نظام GOSI هو');
    expect(tokens.find((t) => t.text === 'GOSI')?.lang).toBe('en');
    expect(tokens.filter((t) => t.text !== 'GOSI').every((t) => t.lang === 'ar')).toBe(true);
    expect(tokens).toHaveLength(6);
  });

  it('excludes mixed-script tokens', () => {
    expect(words('hello GOSIنظام world')).toEqual(['hello', 'world']);
  });

  it('excludes URLs, emails, references and substitution fields', () => {
    expect(words('see https://gosi.gov.sa/ar/services or mail info@gosi.gov.sa')).toEqual(['see', 'or', 'mail']);
    expect(words('case CS-104233 and طلب ١٢٣٤٥')).toEqual(['case', 'and', 'طلب']);
    expect(words('Dear $(user.firstName), welcome')).toEqual(['Dear', 'welcome']);
  });

  it('skips single letters', () => {
    expect(words('e-mail it')).toEqual(['mail', 'it']);
  });

  describe('settledness', () => {
    it('word being typed is pending', () => {
      const [t] = tokensOf('recie', 5);
      expect(t.pending).toBe(true);
    });

    it('typing a boundary settles the word', () => {
      const [t] = tokensOf('recieve ', 8);
      expect(t.pending).toBe(false);
    });

    it('caret inside an earlier word makes only that word pending', () => {
      const tokens = tokensOf('one two three', 5); // inside "two"
      expect(tokens.map((t) => t.pending)).toEqual([false, true, false]);
    });

    it('no caret means everything is settled', () => {
      expect(tokensOf('one two').every((t) => !t.pending)).toBe(true);
    });
  });
});
