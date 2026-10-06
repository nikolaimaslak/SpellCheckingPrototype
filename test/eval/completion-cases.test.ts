import { describe, expect, it } from 'vitest';
import { CATEGORIES, CASE_LANGS, loadCases, parseCases } from '../../eval/completion/cases';

const line = (o: object) => JSON.stringify(o);
const ok = { id: 'a', lang: 'en', category: 'mid-word', prefix: 'Thank you for your pati', seamWord: 'patience' };

describe('completion cases', () => {
  it('loads a valid file', () => {
    const d = parseCases([line(ok), '', line({ ...ok, id: 'b', lang: 'ar', category: 'after-space', prefix: 'شكراً ' })].join('\n'));
    expect(d.cases.map((c) => c.id)).toEqual(['a', 'b']);
    expect(d.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('names the line of a malformed case or a duplicate id', () => {
    expect(() => parseCases([line(ok), '{oops'].join('\n'), 'x.jsonl')).toThrow('x.jsonl:2: invalid JSON');
    expect(() => parseCases([line(ok), line(ok)].join('\n'), 'x.jsonl')).toThrow('x.jsonl:2: duplicate id "a"');
    expect(() => parseCases(line({ ...ok, lang: 'fr' }), 'x.jsonl')).toThrow('x.jsonl:1: lang must be');
    expect(() => parseCases(line({ ...ok, transcript: [{ role: 'bot', text: 'x' }] }), 'x.jsonl')).toThrow('x.jsonl:1: transcript');
  });

  it('changes the hash when a case changes', () => {
    expect(parseCases(line(ok)).hash).not.toBe(parseCases(line({ ...ok, prefix: 'Thank you for your pa' })).hash);
  });
});

describe('the committed dataset', () => {
  it('loads, with every language and category represented', () => {
    const { cases } = loadCases();
    const count = (k: 'lang' | 'category', v: string) => cases.filter((c) => c[k] === v).length;
    const byLang = Object.fromEntries(CASE_LANGS.map((l) => [l, count('lang', l)]));
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, count('category', c)]));
    console.log('completion cases:', cases.length, byLang, byCategory);
    expect(cases.length).toBeGreaterThanOrEqual(55);
    expect(byLang.ar).toBeGreaterThanOrEqual(15);
    expect(byLang.mixed).toBeGreaterThanOrEqual(8);
    for (const c of CATEGORIES) expect(byCategory[c], c).toBeGreaterThan(0);
    for (const c of cases.filter((c) => c.category === 'mid-word')) expect(c.seamWord, c.id).toBeTruthy();
  });
});
