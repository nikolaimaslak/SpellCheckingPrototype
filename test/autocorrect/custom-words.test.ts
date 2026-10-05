import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../../src/autocorrect/confidence';
import { loadHunspell } from '../../src/spell/engine';
import { createHandler } from '../../src/spell/handler';
import type { SpellReply } from '../../src/spell/protocol';

let handle: ReturnType<typeof createHandler>;
let id = 0;
const result = (r: SpellReply) => {
  if (!r.ok) throw new Error(r.error);
  return r.result;
};

beforeAll(async () => {
  handle = createHandler(
    () => loadHunspell({ wasmBinary: readFileSync('src/spell/wasm/hunspell.wasm') }),
    async () => ({ aff: readFileSync('node_modules/dictionary-en/index.aff'), dic: readFileSync('node_modules/dictionary-en/index.dic') }),
  );
  await handle({ id: id++, type: 'load', langs: ['en'] });
  for (const word of ['GOSI', 'Absher']) await handle({ id: id++, type: 'add', lang: 'en', word });
});

describe('custom dictionary words in the real engine', () => {
  it('accepts a custom word', async () => {
    expect(result(await handle({ id: id++, type: 'spell', lang: 'en', word: 'GOSI' }))).toBe(true);
  });

  it('offers a custom word as a suggestion', async () => {
    expect(result(await handle({ id: id++, type: 'suggest', lang: 'en', word: 'GOSSI' }))).toContain('GOSI');
  });

  it('makes a custom word an auto-correct target when it is the only one-edit neighbor', async () => {
    const neighbors = result(await handle({ id: id++, type: 'neighbors', lang: 'en', word: 'Abshr' })) as string[];
    const fix = decide('Abshr', 'en', { neighbors, caseFix: null }, { ignored: new Set(), customWords: new Set(['GOSI', 'Absher']) });
    expect(neighbors).toEqual(['absher']);
    expect(fix).toBe('Absher');
  });
});
