import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadHunspell } from '../../src/spell/engine';
import { createHandler, type DictionaryLoader } from '../../src/spell/handler';

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
