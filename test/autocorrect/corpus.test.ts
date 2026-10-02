// Runs a corpus of common typos through the real engine and dictionaries, so
// that tuning the confidence rule can never silently introduce a wrong fix.
// Hunspell's suggestions are time-limited, so under CPU load an extra word can
// become an auto-fix (docs/known-issues.md, KI-1): the expected sets are a
// floor, and "never a wrong fix" is the hard guarantee.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../../src/autocorrect/confidence';
import { loadHunspell } from '../../src/spell/engine';
import { createHandler, type DictionaryLoader } from '../../src/spell/handler';
import type { Lang } from '../../src/spell/protocol';

const loader: DictionaryLoader = async (lang) =>
  lang === 'en'
    ? { aff: readFileSync('node_modules/dictionary-en/index.aff'), dic: readFileSync('node_modules/dictionary-en/index.dic') }
    : { aff: readFileSync('dicts/ar/ar.aff'), dic: readFileSync('dicts/ar/ar.dic') };

// typo → intended word
const EN: Record<string, string> = {
  teh: 'the', adress: 'address', seperate: 'separate', definately: 'definitely', occured: 'occurred', untill: 'until',
  wich: 'which', recieve: 'receive', beleive: 'believe', thier: 'their', accomodate: 'accommodate', tommorow: 'tomorrow',
  goverment: 'government', freind: 'friend', wierd: 'weird', becuase: 'because', calender: 'calendar',
  enviroment: 'environment', necesary: 'necessary', sucess: 'success', pleae: 'please', thnak: 'thank',
  reqeust: 'request', informaton: 'information', acount: 'account', paymnet: 'payment', registraiton: 'registration',
  pensoin: 'pension', contributon: 'contribution', apologise: 'apologize',
};
const AR: Record<string, string> = {
  اذا: 'إذا', انا: 'أنا', الى: 'إلى', اسرة: 'أسرة', اريد: 'أريد', استاذ: 'أستاذ', امل: 'أمل', اسئلة: 'أسئلة',
  مساعده: 'مساعدة', الطلبب: 'الطلب', التامينات: 'التأمينات', الاجتماعيه: 'الاجتماعية', شكرأ: 'شكرا', مرحيا: 'مرحبا',
  كيفف: 'كيف', يمكنتي: 'يمكنني', مسؤل: 'مسؤول', الاشتراكت: 'الاشتراكات', التسجبل: 'التسجيل', النضام: 'النظام',
};

const EXPECTED_EN = [
  'seperate', 'definately', 'occured', 'untill', 'beleive', 'accomodate', 'goverment', 'freind', 'becuase', 'calender',
  'enviroment', 'necesary', 'sucess', 'thnak', 'reqeust', 'informaton', 'paymnet', 'registraiton', 'pensoin',
];
const EXPECTED_AR = ['اذا', 'الى', 'مساعده', 'الاجتماعيه', 'النضام'];

const ctx = { ignored: new Set<string>(), customWords: new Set<string>() };
let fixes: Record<Lang, Record<string, string>>;

beforeAll(async () => {
  const handle = createHandler(() => loadHunspell({ wasmBinary: readFileSync('src/spell/wasm/hunspell.wasm') }), loader);
  await handle({ id: 0, type: 'load', langs: ['en', 'ar'] });
  fixes = { en: {}, ar: {} };
  let id = 1;
  for (const [lang, corpus] of [['en', EN], ['ar', AR]] as const) {
    for (const typo of Object.keys(corpus)) {
      const reply = await handle({ id: id++, type: 'suggest', lang, word: typo });
      if (!reply.ok) throw new Error(reply.error);
      const fix = decide(typo, lang, reply.result as string[], ctx);
      if (fix) fixes[lang][typo] = fix;
    }
  }
});

describe('auto-correct corpus', () => {
  it('auto-fixes at least the expected English typos', () => {
    expect(Object.keys(fixes.en)).toEqual(expect.arrayContaining(EXPECTED_EN));
  });

  it('auto-fixes at least the expected Arabic typos', () => {
    expect(Object.keys(fixes.ar)).toEqual(expect.arrayContaining(EXPECTED_AR));
  });

  it('never produces a wrong fix', () => {
    for (const [typo, fix] of Object.entries(fixes.en)) expect(fix, typo).toBe(EN[typo]);
    for (const [typo, fix] of Object.entries(fixes.ar)) expect(fix, typo).toBe(AR[typo]);
  });
});
