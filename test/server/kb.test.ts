import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kbPassages, retrieveKb, type KbArticle } from '../../server/retrieval';

const data = JSON.parse(readFileSync('server/data/kb.json', 'utf8')) as { _note: string; articles: KbArticle[] };
const passages = kbPassages(data.articles);
const ids = (q: string) => retrieveKb(passages, q).map((p) => p.id);

describe('knowledge base retrieval (calibrates KB_THRESHOLD)', () => {
  it('is labeled synthetic and split into titled passages', () => {
    expect(data._note).toMatch(/SYNTHETIC/);
    expect(passages[0]).toMatchObject({ id: 'kb:en-early-retirement#0', lang: 'en' });
    expect(passages[0].text.startsWith('Early retirement eligibility: ')).toBe(true);
  });

  it.each([
    ['Am I eligible for early retirement? I have 26 years of contributions.', 'kb:en-early-retirement'],
    ['My father passed away, can our family get a survivor pension?', 'kb:en-survivor-benefits'],
    ['How do I claim unemployment insurance after losing my job?', 'kb:en-unemployment'],
    ['How do I register an employee?', 'kb:en-new-employee'],
    ['هل يحق لي التقاعد المبكر؟ لدي 26 سنة من الاشتراكات', 'kb:ar-early-retirement'],
    ['توفي والدي، هل تحصل الأسرة على معاش؟', 'kb:ar-survivor-benefits'],
    ['كيف أسجل موظف جديد؟', 'kb:ar-new-employee'],
  ])('strong question %s → passages only from %s', (q, article) => {
    const got = ids(q);
    expect(got.length).toBeGreaterThan(0);
    for (const id of got) expect(id.startsWith(article + '#')).toBe(true);
  });

  it.each([
    'Hello, good morning',
    'Thank you so much for your help',
    'مرحبا، صباح الخير',
    'شكرا جزيلا',
    'What is the weather like today?',
    'What about my pension?',
    'I have a question about my contributions',
    'سؤال عن المعاش',
  ])('weak or vague message %s → nothing', (q) => {
    expect(ids(q)).toEqual([]);
  });

  it('returns at most two passages', () => {
    expect(ids('early retirement contributions pension salary applications').length).toBeLessThanOrEqual(2);
  });
});
