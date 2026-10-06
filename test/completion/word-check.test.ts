import { describe, expect, it } from 'vitest';
import { firstWordToCheck, spellServiceCheck, strayLetter } from '../../src/completion/word-check';
import type { SpellService } from '../../src/spell/service';

const PREFIX = "If it weren't for the arcane name you could have be";

describe('firstWordToCheck', () => {
  it('joins a continuation of the unfinished word', () => {
    expect(firstWordToCheck(PREFIX, 'n easily confused.')).toEqual({ word: 'ben', lang: 'en', standalone: false });
    expect(firstWordToCheck("It hasn't been proce", 'ssed yet.')).toEqual({ word: 'processed', lang: 'en', standalone: false });
    expect(firstWordToCheck('تم استلا', 'م طلبك')).toEqual({ word: 'استلام', lang: 'ar', standalone: false });
  });

  it('takes the first word of a suggestion that starts a new word', () => {
    expect(firstWordToCheck(PREFIX, ' n easily confused.')).toEqual({ word: 'n', lang: 'en', standalone: true });
    expect(firstWordToCheck('Thank you, your request', ' has been received.')).toEqual({ word: 'has', lang: 'en', standalone: true });
    expect(firstWordToCheck('Thank you, your request ', 'will be')).toEqual({ word: 'will', lang: 'en', standalone: true });
  });

  it('has nothing to check when the suggestion starts with punctuation', () => {
    expect(firstWordToCheck('Thank you, your request', ', thank you.')).toBeNull();
    expect(firstWordToCheck('Your request', '')).toBeNull();
  });
});

describe('strayLetter', () => {
  it('flags a lone English letter as a new word, except a and I', () => {
    expect(strayLetter(firstWordToCheck(PREFIX, ' n easily')!)).toBe(true);
    expect(strayLetter(firstWordToCheck('Thank you,', ' a pleasure')!)).toBe(false);
    expect(strayLetter(firstWordToCheck('Yes,', ' I will')!)).toBe(false);
    expect(strayLetter(firstWordToCheck(PREFIX, 'n easily')!)).toBe(false); // joined: the engine decides
    expect(strayLetter(firstWordToCheck('نعم،', ' و شكراً')!)).toBe(false); // Arabic "و" is a word
  });
});

describe('spellServiceCheck', () => {
  const fake = (ready: boolean, bad: string[]): SpellService =>
    ({
      isReady: () => ready,
      check: async () => {},
      misspelled: (_l: string, w: string) => bad.includes(w),
    }) as unknown as SpellService;

  it('reports accepted, rejected, or unknown when no engine is ready', async () => {
    expect(await spellServiceCheck(() => fake(true, ['ben']))('ben', 'en')).toBe(false);
    expect(await spellServiceCheck(() => fake(true, ['ben']))('been', 'en')).toBe(true);
    expect(await spellServiceCheck(() => fake(false, []))('ben', 'en')).toBeUndefined();
    expect(await spellServiceCheck(() => undefined)('ben', 'en')).toBeUndefined();
  });
});

describe('first word on the real engines', () => {
  it('rejects broken joins and accepts real words, in English and Arabic', async () => {
    const { readFileSync } = await import('node:fs');
    const { loadHunspell } = await import('../../src/spell/engine');
    const { createHandler } = await import('../../src/spell/handler');
    const handle = createHandler(
      () => loadHunspell({ wasmBinary: readFileSync('src/spell/wasm/hunspell.wasm') }),
      async (lang) =>
        lang === 'en'
          ? { aff: readFileSync('node_modules/dictionary-en/index.aff'), dic: readFileSync('node_modules/dictionary-en/index.dic') }
          : { aff: readFileSync('dicts/ar/ar.aff'), dic: readFileSync('dicts/ar/ar.dic') },
    );
    await handle({ id: 1, type: 'load', langs: ['en', 'ar'] });
    let id = 1;
    const accepted = async (prefix: string, suggestion: string) => {
      const w = firstWordToCheck(prefix, suggestion)!;
      const reply = await handle({ id: ++id, type: 'spell', lang: w.lang, word: w.word });
      return reply.ok && reply.result === true;
    };
    expect(await accepted("If it weren't for the arcane name you could have be", 'n easily confused.')).toBe(false); // "ben"
    expect(await accepted("It hasn't been proce", 'ssed yet.')).toBe(true); // "processed"
    expect(await accepted('تم استلا', 'م طلبك')).toBe(true); // "استلام"
    expect(await accepted('تم استلا', 'ظ طلبك')).toBe(false); // "استلاظ"
  }, 60000);
});
