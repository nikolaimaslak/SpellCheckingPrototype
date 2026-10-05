import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadHunspell } from '../../src/spell/engine';
import { createHandler, type DictionaryLoader } from '../../src/spell/handler';
import type { SpellReply } from '../../src/spell/protocol';

const runtime = () => loadHunspell({ wasmBinary: readFileSync('src/spell/wasm/hunspell.wasm') });

// English from the npm package; Arabic deliberately unavailable.
const englishOnly: DictionaryLoader = async (lang) => {
  if (lang !== 'en') throw new Error(`dictionary not found: ${lang}`);
  return {
    aff: readFileSync('node_modules/dictionary-en/index.aff'),
    dic: readFileSync('node_modules/dictionary-en/index.dic'),
  };
};

describe('spelling worker handler', () => {
  it('reports English loaded and Arabic failed with a reason', async () => {
    const handle = createHandler(runtime, englishOnly);
    const reply = await handle({ id: 7, type: 'load', langs: ['en', 'ar'] });
    expect(reply).toMatchObject({
      id: 7,
      ok: true,
      result: { loaded: [{ lang: 'en' }], failed: [{ lang: 'ar', reason: 'dictionary not found: ar' }] },
    });
  });

  it('echoes request ids on spell and suggest', async () => {
    const handle = createHandler(runtime, englishOnly);
    await handle({ id: 1, type: 'load', langs: ['en'] });
    expect(await handle({ id: 2, type: 'spell', lang: 'en', word: 'recieve' })).toEqual({ id: 2, ok: true, result: false });
    const suggest = await handle({ id: 3, type: 'suggest', lang: 'en', word: 'recieve' });
    expect(suggest.id).toBe(3);
    expect(suggest.ok && suggest.result).toContain('receive');
  });

  it('applies runtime-added words', async () => {
    const handle = createHandler(runtime, englishOnly);
    await handle({ id: 1, type: 'load', langs: ['en'] });
    await handle({ id: 2, type: 'add', lang: 'en', word: 'GOSI' });
    expect(await handle({ id: 3, type: 'spell', lang: 'en', word: 'GOSI' })).toEqual({ id: 3, ok: true, result: true });
  });

  it('errors for an unloaded language and keeps serving', async () => {
    const handle = createHandler(runtime, englishOnly);
    await handle({ id: 1, type: 'load', langs: ['en', 'ar'] });
    expect(await handle({ id: 2, type: 'spell', lang: 'ar', word: 'مرحبا' })).toEqual({
      id: 2,
      ok: false,
      error: 'language not loaded: ar',
    });
    expect(await handle({ id: 3, type: 'spell', lang: 'en', word: 'receive' })).toEqual({ id: 3, ok: true, result: true });
  });
});

const bothLanguages: DictionaryLoader = async (lang) =>
  lang === 'en'
    ? { aff: readFileSync('node_modules/dictionary-en/index.aff'), dic: readFileSync('node_modules/dictionary-en/index.dic') }
    : { aff: readFileSync('dicts/ar/ar.aff'), dic: readFileSync('dicts/ar/ar.dic') };

describe('batch check', () => {
  it('flags only misspelled words in a mixed batch', async () => {
    const handle = createHandler(runtime, bothLanguages);
    await handle({ id: 1, type: 'load', langs: ['en', 'ar'] });
    const reply = await handle({ id: 9, type: 'check', words: { en: ['receive', 'recieve'], ar: ['مرحبا'] } });
    expect(reply).toEqual({ id: 9, ok: true, result: { misspelled: { en: ['recieve'], ar: [] }, unchecked: {} } });
  });

  it('reports words of an unloaded language as unchecked', async () => {
    const handle = createHandler(runtime, englishOnly);
    await handle({ id: 1, type: 'load', langs: ['en', 'ar'] });
    const reply = await handle({ id: 2, type: 'check', words: { en: ['recieve'], ar: ['مرحبا'] } });
    expect(reply).toEqual({ id: 2, ok: true, result: { misspelled: { en: ['recieve'] }, unchecked: { ar: ['مرحبا'] } } });
  });

  it('accepts vowelled and tatweel Arabic forms', async () => {
    const handle = createHandler(runtime, bothLanguages);
    await handle({ id: 1, type: 'load', langs: ['ar'] });
    const reply = await handle({ id: 2, type: 'check', words: { ar: ['مَرْحَبًا', 'مرحـــبا'] } });
    expect(reply.ok && reply.result).toEqual({ misspelled: { ar: [] }, unchecked: {} });
  });

  it('flags a hamza error and suggests the hamzated form', async () => {
    // "اذا" (bare alef) is not in AyaSpell; the only suggestion is "إذا".
    const handle = createHandler(runtime, bothLanguages);
    await handle({ id: 1, type: 'load', langs: ['ar'] });
    const check = await handle({ id: 2, type: 'check', words: { ar: ['اذا', 'إذا'] } });
    expect(check.ok && check.result).toEqual({ misspelled: { ar: ['اذا'] }, unchecked: {} });
    const suggest = await handle({ id: 3, type: 'suggest', lang: 'ar', word: 'اذا' });
    expect(suggest.ok && suggest.result).toContain('إذا');
  });
});

describe('one-edit neighbors', () => {
  let handle: ReturnType<typeof createHandler>;
  let id = 1;
  const neighbors = async (lang: 'en' | 'ar', word: string) => {
    const mine = ++id;
    const reply: SpellReply = await handle({ id: mine, type: 'neighbors', lang, word });
    if (!reply.ok) throw new Error(reply.error);
    expect(reply.id).toBe(mine);
    return reply.result as string[];
  };

  beforeAll(async () => {
    handle = createHandler(runtime, bothLanguages);
    await handle({ id: 1, type: 'load', langs: ['en', 'ar'] });
    await handle({ id: ++id, type: 'add', lang: 'en', word: 'tawasul' });
  });

  it('lists every English word one edit away, sorted', async () => {
    expect(await neighbors('en', 'recieve')).toEqual(['receive', 'relieve']);
    expect(await neighbors('en', 'seperate')).toEqual(['separate']);
  });

  it('compares English in lower case and accepts capitalized-only words for a capitalized word', async () => {
    expect(await neighbors('en', 'Seperate')).toEqual(['separate']);
    // "Fatima" is only accepted capitalized.
    expect(await neighbors('en', 'Fatimah')).toContain('fatima');
    expect(await neighbors('en', 'fatimah')).not.toContain('fatima');
  });

  it('includes custom words', async () => {
    expect(await neighbors('en', 'tawasull')).toContain('tawasul');
  });

  it('lists Arabic neighbors, ignoring diacritics', async () => {
    expect(await neighbors('ar', 'المستخذم')).toEqual(['المستخدم']);
    expect(await neighbors('ar', 'المُستخذم')).toEqual(['المستخدم']);
    expect((await neighbors('ar', 'النضام')).length).toBeGreaterThan(1);
  });

  it('errors for an unloaded language and keeps serving', async () => {
    const english = createHandler(runtime, englishOnly);
    await english({ id: 1, type: 'load', langs: ['en'] });
    expect(await english({ id: 2, type: 'neighbors', lang: 'ar', word: 'النضام' })).toEqual({ id: 2, ok: false, error: 'language not loaded: ar' });
    expect(await english({ id: 3, type: 'neighbors', lang: 'en', word: 'seperate' })).toEqual({ id: 3, ok: true, result: ['separate'] });
  });

  it('gives the same reply while every core is busy (KI-1)', async () => {
    const words: ['en' | 'ar', string][] = [['en', 'recieve'], ['ar', 'الإلكطروني'], ['ar', 'النضام']];
    const idle = await Promise.all(words.map(([lang, w]) => neighbors(lang, w)));
    const busy = Array.from({ length: availableParallelism() }, () => new Worker('for (;;) {}', { eval: true }));
    try {
      const loaded = [];
      for (const [lang, w] of words) loaded.push(await neighbors(lang, w));
      expect(loaded).toEqual(idle);
    } finally {
      await Promise.all(busy.map((w) => w.terminate()));
    }
  });
});
