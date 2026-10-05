import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkEntry, parseList } from '../../src/autocorrect/list-checks';
import { AR_AYASPELL, AR_PROJECT } from '../../src/autocorrect/lists/ar';
import { EN_PROJECT } from '../../src/autocorrect/lists/en';
import { knownFix } from '../../src/autocorrect/misspellings';
import { stripMarks } from '../../src/spell/arabic';
import { loadHunspell, type SpellEngine } from '../../src/spell/engine';
import { affText, arabicIsCorrect, committedBlock, extract, renderBlock } from '../../scripts/extract-ayaspell-rep';

const lists = { en: new Map([['teh', 'the']]), ar: new Map([['الى', 'إلى']]) };

describe('knownFix', () => {
  it('matches English in lower case or with a leading capital', () => {
    expect(knownFix('teh', 'en', lists)).toBe('the');
    expect(knownFix('Teh', 'en', lists)).toBe('the');
    expect(knownFix('tEh', 'en', lists)).toBeNull();
    expect(knownFix('TEH', 'en', lists)).toBeNull();
    expect(knownFix('tehh', 'en', lists)).toBeNull();
  });

  it('matches Arabic without diacritics or tatweel', () => {
    expect(knownFix('الى', 'ar', lists)).toBe('إلى');
    expect(knownFix('الىٰ', 'ar', lists)).toBe('إلى');
    expect(knownFix('الـى', 'ar', lists)).toBe('إلى');
  });
});

describe('AyaSpell entries', () => {
  it('match what the extraction script derives from the committed ar.aff (no drift)', async () => {
    expect(committedBlock()).toBe(renderBlock(extract(affText(), await arabicIsCorrect())));
  }, 60000);
});

describe('every list entry passes the checks on the real engine', () => {
  const engines = {} as Record<'en' | 'ar', SpellEngine>;
  const custom = new Set(
    readFileSync('eval/datasets/custom-words.txt', 'utf8')
      .split('\n')
      .map((w) => w.trim())
      .filter((w) => w && !w.startsWith('#')),
  );

  beforeAll(async () => {
    const rt = await loadHunspell({ wasmBinary: readFileSync('src/spell/wasm/hunspell.wasm') });
    engines.en = rt.createEngine(readFileSync('node_modules/dictionary-en/index.aff'), readFileSync('node_modules/dictionary-en/index.dic'));
    engines.ar = rt.createEngine(readFileSync('dicts/ar/ar.aff'), readFileSync('dicts/ar/ar.dic'));
  }, 60000);

  const isCorrect = (lang: 'en' | 'ar') => (w: string) => engines[lang].spell(w) || (lang === 'ar' && stripMarks(w) !== w && engines[lang].spell(stripMarks(w)));

  it.each([
    ['en', 'EN_PROJECT', EN_PROJECT],
    ['ar', 'AR_PROJECT', AR_PROJECT],
    ['ar', 'AR_AYASPELL', AR_AYASPELL],
  ] as const)('%s %s', (lang, _name, text) => {
    const parsed = parseList(text);
    const failures = parsed.entries
      .map((e) => [e, checkEntry(e, lang, isCorrect(lang), custom)] as const)
      .filter(([, f]) => f.length)
      .map(([e, f]) => `${e.typo} → ${e.fix}: ${f.join('; ')}`);
    expect({ duplicates: parsed.duplicates, malformed: parsed.malformed, failures }).toEqual({ duplicates: [], malformed: [], failures: [] });
  });

  it('has no misspelled word in both Arabic lists', () => {
    const aya = new Set(parseList(AR_AYASPELL).entries.map((e) => e.typo));
    expect(parseList(AR_PROJECT).entries.filter((e) => aya.has(e.typo)).map((e) => e.typo)).toEqual([]);
  });
});
