import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { kbPassages, type KbArticle } from '../../server/retrieval';
import { safetyCheck, verbatimIn, vocabulary, type SafetyContext } from '../../server/safety';

const CANNED = 'Your request has been received and will be processed within 3 working days; you will be notified by SMS once it is complete.';
const ctx = (over: Partial<SafetyContext> = {}): SafetyContext => ({
  prefix: 'Thank you, your request',
  customerTurns: [],
  sent: [],
  library: vocabulary([CANNED, 'تم استلام طلبك وسيتم معالجته خلال ثلاثة أيام عمل']),
  allowSourcedFigures: false,
  ...over,
});
const check = (completion: string, over: Partial<SafetyContext> = {}) => safetyCheck(completion, ctx(over));

describe('safetyCheck: figures', () => {
  it.each([
    ' will be processed within 3 working days.',
    ' رقم ١٢٣٤٥',
    ' within three working days.',
    ' خلال ثلاثة أيام عمل',
    ' بثلاثة أيام',
    ' the fee is 50 SAR.',
    ' the fee is fifty riyals.',
    ' at a rate of 9%.',
    ' بنسبة تسعة بالمئة',
  ])('withholds %s', (c) => {
    expect(check(c)).toBe('figure');
  });
});

describe('safetyCheck: dates and timelines', () => {
  it.each([
    ' on Monday.',
    ' from January.',
    ' in March.',
    ' will be ready next week.',
    ' within a few days.',
    ' tomorrow morning.',
    ' اعتباراً من شهر رمضان',
    ' يوم الأحد',
    ' خلال أسبوع',
    ' الشهر القادم',
    ' غداً',
  ])('withholds %s', (c) => {
    expect(check(c)).toBe('date');
  });

  it.each([
    ' and someone will contact you shortly.',
    ' and no one else can see it.',
    ' May I help you with anything else?',
    ' as we march forward.',
    ' have a nice day.',
    ' كيف يمكنني مساعدتك اليوم',
    ' has been received and is being reviewed.',
  ])('lets through %s', (c) => {
    expect(check(c)).toBeNull();
  });
});

describe('safetyCheck: identifiers', () => {
  it('withholds emails and links', () => {
    expect(check(' at www.gosi.gov.sa for details.')).toBe('identifier');
    expect(check(' at https://gosi.gov.sa')).toBe('identifier');
    expect(check(' to info@gosi.gov.sa today.')).toBe('identifier');
  });
});

describe('safetyCheck: conversation words', () => {
  it('withholds names copied from the customer, in English and Arabic', () => {
    expect(check(' Noura, we have received your request.', { customerTurns: ['Hello, this is Noura'] })).toBe('conversation');
    expect(check(' يا نوره، تم استلام طلبك', { prefix: 'شكراً', customerTurns: ['معك نوره من الرياض'] })).toBe('conversation');
  });

  it('lets through customer words that are approved wording or already in the prefix', () => {
    expect(check(' request has been received.', { prefix: 'Thank you, your', customerTurns: ['my request is pending'] })).toBeNull();
    expect(check(' Noura has been registered.', { prefix: 'Dear Noura, your request', customerTurns: ['this is Noura'] })).toBeNull();
  });

  it('only counts customer turns', () => {
    expect(check(' Fatimah.', { customerTurns: [] })).toBeNull();
  });
});

describe('safetyCheck: sourced figures', () => {
  it('lets a figure through only when worded verbatim in a source sent, and only with allow', () => {
    const sent = [CANNED];
    expect(check(' will be processed within 3 working days', { sent })).toBe('figure');
    expect(check(' will be processed within 3 working days', { sent, allowSourcedFigures: true })).toBeNull();
    expect(check(' will be done in 3 days.', { sent, allowSourcedFigures: true })).toBe('figure');
  });

  it('never lets identifiers or conversation words through', () => {
    const sent = ['Write to info@gosi.gov.sa within 3 days'];
    expect(check(' info@gosi.gov.sa within 3 days', { sent, allowSourcedFigures: true })).toBe('identifier');
  });

  it('checks in the order identifier, conversation, figure, date', () => {
    expect(check(' Noura, see www.x.sa on Monday at 3', { customerTurns: ['I am Noura'] })).toBe('identifier');
    expect(check(' Noura, on Monday at 3', { customerTurns: ['I am Noura'] })).toBe('conversation');
    expect(check(' on Monday at 3')).toBe('figure');
  });
});

describe('verbatimIn', () => {
  it('ignores the leading space, final punctuation, case and Arabic marks', () => {
    expect(verbatimIn(' Will be processed within 3 working days.', [CANNED])).toBe(true);
    expect(verbatimIn(' وسيتم معالجتُه', ['تم استلام طلبك وسيتم معالجته'])).toBe(true);
    expect(verbatimIn(' will be processed tomorrow', [CANNED])).toBe(false);
  });
});

describe('the shipped approved texts', () => {
  const canned = (JSON.parse(readFileSync('server/data/canned.json', 'utf8')) as { responses: { id: string; text: string }[] }).responses;
  const kb = kbPassages((JSON.parse(readFileSync('server/data/kb.json', 'utf8')) as { articles: KbArticle[] }).articles);
  const texts = [...canned, ...kb.map((p) => ({ id: p.id, text: p.text }))];
  const library = vocabulary(texts.map((t) => t.text));
  const base = { prefix: '', customerTurns: [], sent: [], library, allowSourcedFigures: false };

  it('withholds exactly the texts with digits or number words under the default', () => {
    const withheld = texts.filter((t) => safetyCheck(` ${t.text}`, base)).map((t) => t.id);
    const numeric = texts.filter((t) => /\p{Nd}/u.test(t.text) || /ثلاثة/u.test(t.text)).map((t) => t.id);
    expect(withheld).toEqual(numeric);
    expect(withheld).toContain('en-request-processing');
    expect(withheld).toContain('ar-request-processing');
  });

  it('lets every text through as its own sourced wording under allow', () => {
    for (const t of texts) expect(safetyCheck(` ${t.text}`, { ...base, sent: [t.text], allowSourcedFigures: true }), t.id).toBeNull();
  });
});
