import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AR_TYPES,
  CONFUSIONS,
  EN_TYPES,
  KEYBOARD,
  apply,
  classify,
  mulberry32,
  variants,
  type EditType,
  type Lang,
} from '../../eval/error-types';

const typeOf = (m: string, w: string, lang: Lang) => classify(m, w, lang)?.type;

describe('taxonomy', () => {
  it('has every type the spec lists, per language', () => {
    expect([...EN_TYPES].sort()).toEqual(['case', 'delete', 'double', 'insert', 'keyboard-sub', 'substitute', 'transpose', 'undouble']);
    expect([...AR_TYPES].sort()).toEqual(
      ['alef-maqsura', 'delete', 'dots', 'emphatic', 'hamza', 'insert', 'keyboard-sub', 'substitute', 'ta-marbuta', 'transpose'],
    );
  });

  it('keeps confusion sets and keyboard neighbours symmetric', () => {
    for (const set of Object.values(CONFUSIONS)) {
      for (const pair of set) expect(set.has([...pair].reverse().join('')), pair).toBe(true);
    }
    for (const map of Object.values(KEYBOARD)) {
      for (const [k, near] of map) for (const n of near) expect(map.get(n)?.has(k), `${k}-${n}`).toBe(true);
    }
  });

  it('places neighbouring keys on both layouts', () => {
    expect(KEYBOARD.en.get('s')).toEqual(new Set(['a', 'd', 'w', 'e', 'z', 'x']));
    expect(KEYBOARD.ar.get('س')?.has('ي')).toBe(true);
  });
});

describe('classify', () => {
  it.each([
    ['اذا', 'إذا', 'ar', 'hamza'],
    ['الى', 'إلى', 'ar', 'hamza'],
    ['مسول', 'مسؤول', 'ar', 'hamza'],
    ['مسوول', 'مسؤول', 'ar', 'hamza'],
    ['سما', 'سماء', 'ar', 'hamza'],
    ['المساعده', 'المساعدة', 'ar', 'ta-marbuta'],
    ['علي', 'على', 'ar', 'alef-maqsura'],
    ['النضام', 'النظام', 'ar', 'emphatic'],
    ['الطلت', 'الطلب', 'ar', 'dots'],
    ['مرحيا', 'مرحبا', 'ar', 'dots'],
    ['مرحلا', 'مرحبا', 'ar', 'keyboard-sub'],
    ['مرحكا', 'مرحبا', 'ar', 'substitute'],
    ['الطلبب', 'الطلب', 'ar', 'insert'],
    ['التسجل', 'التسجيل', 'ar', 'delete'],
    ['التسيجل', 'التسجيل', 'ar', 'transpose'],
    ['teh', 'the', 'en', 'transpose'],
    ['untill', 'until', 'en', 'double'],
    ['ocured', 'occurred', 'en', 'multi'],
    ['occured', 'occurred', 'en', 'undouble'],
    ['wich', 'which', 'en', 'delete'],
    ['pleaae', 'please', 'en', 'keyboard-sub'],
    ['plezse', 'please', 'en', 'keyboard-sub'],
    ['recieve', 'receive', 'en', 'transpose'],
    ['seperate', 'separate', 'en', 'substitute'],
    ['pleasde', 'please', 'en', 'insert'],
    ['riyadh', 'Riyadh', 'en', 'case'],
    ['alot', 'a lot', 'en', 'boundary'],
  ] as const)('%s → %s (%s) is %s', (m, w, lang, type) => {
    expect(typeOf(m, w, lang)).toBe(type);
  });

  it('types each edit of a multi-edit misspelling', () => {
    const c = classify('acomodate', 'accommodate', 'en')!;
    expect(c.type).toBe('multi');
    expect(c.edits.map((e) => [e.type, e.from])).toEqual([
      ['undouble', 'c'],
      ['undouble', 'm'],
    ]);
  });

  it('ignores Arabic diacritics and tatweel', () => {
    expect(classify('مَرْحَبًا', 'مرحبا', 'ar')).toBeNull();
    expect(typeOf('مرحـيا', 'مرحبا', 'ar')).toBe('dots');
  });

  it('returns no type for identical words or mixed scripts', () => {
    expect(classify('please', 'please', 'en')).toBeNull();
    expect(classify('GOSI', 'نظام', 'ar')).toBeNull();
    expect(classify('نظامGOSI', 'نظام', 'ar')).toBeNull();
  });
});

describe('inserting errors', () => {
  const EN_WORDS = ['please', 'request', 'contribution', 'pension', 'Riyadh', 'address', 'occurred', 'the'];
  const AR_WORDS = ['مرحبا', 'التأمينات', 'المساعدة', 'إذا', 'على', 'النظام', 'الاشتراكات', 'مسؤول', 'سماء', 'الطلب'];

  it('round-trips: every inserted error classifies as its type', () => {
    const cases: [Lang, readonly EditType[], string[]][] = [
      ['en', EN_TYPES, EN_WORDS],
      ['ar', AR_TYPES, AR_WORDS],
    ];
    for (const [lang, types, words] of cases) {
      for (const type of types) {
        let applied = 0;
        for (const word of words) {
          for (let seed = 1; seed <= 20; seed++) {
            const v = apply(word, type, lang, mulberry32(seed));
            if (v === null) continue;
            applied++;
            expect(typeOf(v, word, lang), `${type}: ${word} → ${v}`).toBe(type);
          }
        }
        expect(applied, `${lang} ${type} never applied`).toBeGreaterThan(0);
      }
    }
  });

  it('reports a type with no applicable position as null', () => {
    expect(apply('the', 'undouble', 'en', mulberry32(1))).toBeNull();
    expect(apply('مرحبا', 'ta-marbuta', 'ar', mulberry32(1))).toBeNull();
  });

  it('is deterministic for a seed', () => {
    const a = AR_WORDS.map((w) => apply(w, 'dots', 'ar', mulberry32(7)));
    const b = AR_WORDS.map((w) => apply(w, 'dots', 'ar', mulberry32(7)));
    expect(a).toEqual(b);
  });

  it('puts ta marbuta errors where the letter is', () => {
    expect(variants('المساعدة', 'ta-marbuta', 'ar')).toEqual(['المساعده']);
  });
});

// The same fixture runs against the Python port (server/tests/test_error_types.py),
// so the telemetry summary and the benchmark classify every pair alike.
describe('shared error-type fixture', () => {
  const fixture = JSON.parse(readFileSync('test/fixtures/error-types.json', 'utf8')) as {
    cases: { misspelled: string; intended: string; lang: Lang; expected: ReturnType<typeof classify> }[];
  };

  it('covers English, Arabic, multi, boundary and unclassifiable pairs', () => {
    const types = new Set<string | null>(fixture.cases.map((c) => c.expected?.type ?? null));
    for (const t of [...EN_TYPES, ...AR_TYPES, 'multi', 'boundary', null]) expect(types.has(t), String(t)).toBe(true);
  });

  it.each(fixture.cases.map((c) => [c.misspelled, c.intended, c.lang, c] as const))('%s → %s (%s)', (_m, _w, _l, c) => {
    expect(classify(c.misspelled, c.intended, c.lang)).toEqual(c.expected);
  });
});
