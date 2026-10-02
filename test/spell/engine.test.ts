import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadHunspell, type HunspellRuntime, type SpellEngine } from '../../src/spell/engine';

// dictionary-en's package exports hide the raw files, so read them by path.
const enDir = 'node_modules/dictionary-en/';

let runtime: HunspellRuntime;

beforeAll(async () => {
  runtime = await loadHunspell({ wasmBinary: readFileSync('src/spell/wasm/hunspell.wasm') });
});

describe('English engine', () => {
  const load = () => runtime.createEngine(readFileSync(enDir + 'index.aff'), readFileSync(enDir + 'index.dic'));

  it('accepts a correct word', () => {
    expect(load().spell('receive')).toBe(true);
  });

  it('rejects a misspelling and suggests the fix', () => {
    const en = load();
    expect(en.spell('recieve')).toBe(false);
    expect(en.suggest('recieve')).toContain('receive');
  });

  it('accepts a runtime-added word', () => {
    const en = load();
    expect(en.spell('GOSI')).toBe(false);
    en.add('GOSI');
    expect(en.spell('GOSI')).toBe(true);
  });

  it('refuses use after destroy', () => {
    const en = load();
    en.destroy();
    expect(() => en.spell('receive')).toThrow(/destroy/);
  });
});

// Arabic is local-evaluation only (license pending), so this runs only after
// `npm run fetch-dicts` has provisioned .local-dicts/ar/.
const arDir = '.local-dicts/ar/';
// Hunspell may suggest splitting into two words, so allow single spaces between Arabic runs.
const ARABIC = /^\p{Script=Arabic}+( \p{Script=Arabic}+)*$/u;

describe.skipIf(!existsSync(arDir + 'ar.dic'))('Arabic engine', () => {
  let ar: SpellEngine;
  beforeAll(() => {
    ar = runtime.createEngine(readFileSync(arDir + 'ar.aff'), readFileSync(arDir + 'ar.dic'));
  });

  it('accepts a common word', () => {
    expect(ar.spell('مرحبا')).toBe(true);
  });

  it('suggests valid Arabic strings for a misspelling', () => {
    // "مساعده" for "مساعدة" (taa marbuta typed as haa) is a frequent slip.
    const misspelled = 'مساعدهة';
    expect(ar.spell(misspelled)).toBe(false);
    const suggestions = ar.suggest(misspelled);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s).toMatch(ARABIC);
  });
});
