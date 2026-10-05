// Safety filter for completions (formal Req 3.7: no PII, identifiers,
// amounts, dates or timelines). Deterministic and server-side, so no client
// can bypass it. A hit withholds the whole completion; only the reason is
// ever reported, never the text.
import { normalize } from './retrieval.ts';

export type WithheldReason = 'figure' | 'date' | 'identifier' | 'conversation';
export const WITHHELD_REASONS: readonly WithheldReason[] = ['figure', 'date', 'identifier', 'conversation'];

export interface SafetyContext {
  /** The agent's text so far. */
  prefix: string;
  /** The customer's messages in this request. */
  customerTurns: readonly string[];
  /** The canned responses and knowledge base passages sent with this request. */
  sent: readonly string[];
  /** Normalized vocabulary of the whole approved library (see vocabulary()). */
  library: ReadonlySet<string>;
  /** COMPLETION_SOURCED_FIGURES=allow: figures and dates pass when worded verbatim in `sent`. */
  allowSourcedFigures: boolean;
}

// Same patterns as src/tokenizer/exclusions.ts (the server doesn't import src/).
const URL = /\b(?:https?:\/\/|www\.)\S+/iu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u;

const set = (words: string) => new Set(words.trim().split(/\s+/).map(normalize));

// Figures. "one"/"واحد" are left out: "someone", "no one", "one of our agents".
const NUMBER_WORDS = set(`
  zero two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen
  eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred hundreds thousand thousands
  million millions billion billions dozen dozens
  صفر اثنان اثنين اثنتان اثنتين ثلاث ثلاثة أربع أربعة خمس خمسة ست ستة سبع سبعة ثمان ثماني ثمانية تسع تسعة عشر عشرة
  عشرون عشرين ثلاثون ثلاثين أربعون أربعين خمسون خمسين ستون ستين سبعون سبعين ثمانون ثمانين تسعون تسعين
  مئة مائة مئتان مئتين ألف آلاف مليون ملايين`);
const CURRENCY_WORDS = set(`sar riyal riyals dollar dollars usd percent ريال ريالات هللة هللات دولار بالمئة بالمائة`);
const FIGURE_SYMBOLS = /[\p{Nd}$﷼%٪]/u;

// Dates. English months that are also common words count only when capitalized ("March"),
// and "May" (also a verb) is left out: next to a digit it is already a figure.
const MONTHS_ANY_CASE = set('january february april june july september october november december');
const MONTHS_CAPITALIZED = new Set(['March', 'August']);
const WEEKDAYS = set(`monday tuesday wednesday thursday friday saturday sunday
  الأحد الاثنين الإثنين الثلاثاء الأربعاء الخميس الجمعة السبت`);
// Arabic months: Gregorian, Levantine and Hijri. "آب" is left out (it folds to "اب", father).
const AR_MONTHS = set(`يناير فبراير مارس أبريل ابريل مايو يونيو يونيه يوليو يوليه أغسطس سبتمبر أكتوبر نوفمبر ديسمبر
  كانون شباط آذار نيسان أيار حزيران تموز أيلول تشرين
  محرم ربيع جمادى رجب شعبان رمضان شوال القعدة الحجة`);
const RELATIVE_DAYS = set('tomorrow yesterday tonight غدا غداً بكرة أمس البارحة');
const TIME_UNITS = set(`day days week weeks month months year years hour hours minute minutes
  يوم أيام أسبوع أسابيع شهر أشهر شهور سنة سنوات سنين ساعة ساعات دقيقة دقائق`);
const RELATIVE_WORDS = set('within next few couple several after خلال القادم المقبل القادمة المقبلة بعد عدة بضعة');

const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
const words = (text: string) => [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);

/** A normalized word and its forms without one Arabic proclitic (و ف, then ب ل ك) and/or the article ال. */
function forms(word: string): string[] {
  const out = new Set([word]);
  for (const w of [...out]) if (/^[وف]./u.test(w)) out.add(w.slice(1));
  for (const w of [...out]) if (/^[بلك]./u.test(w)) out.add(w.slice(1));
  for (const w of [...out]) if (w.startsWith('ال') && w.length > 3) out.add(w.slice(2));
  for (const w of [...out]) if (w.startsWith('لل') && w.length > 3) out.add(w.slice(2)); // لل… = ل + ال…, alef dropped
  return [...out];
}
const hits = (word: string, s: ReadonlySet<string>) => forms(normalize(word)).some((f) => s.has(f));

/** The normalized words of `texts`, for the approved-library vocabulary. */
export function vocabulary(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) for (const w of words(t)) out.add(normalize(w));
  return out;
}

const collapse = (text: string) => normalize(text).replace(/\s+/gu, ' ').trim();

/** True when the completion, without its leading space and final punctuation, is worded verbatim in one of `texts`. */
export function verbatimIn(completion: string, texts: readonly string[]): boolean {
  const core = collapse(completion.replace(/[.!?؟،,;:]+\s*$/u, ''));
  return !!core && texts.some((t) => collapse(t).includes(core));
}

function figure(completion: string, ws: string[]): boolean {
  return FIGURE_SYMBOLS.test(completion) || ws.some((w) => hits(w, NUMBER_WORDS) || hits(w, CURRENCY_WORDS));
}

function date(ws: string[]): boolean {
  if (ws.some((w) => MONTHS_CAPITALIZED.has(w) || hits(w, MONTHS_ANY_CASE) || hits(w, AR_MONTHS) || hits(w, WEEKDAYS) || hits(w, RELATIVE_DAYS))) return true;
  return ws.some((w) => hits(w, TIME_UNITS)) && ws.some((w) => hits(w, RELATIVE_WORDS));
}

function conversation(ws: string[], ctx: SafetyContext): boolean {
  const own = new Set(words(ctx.prefix).map(normalize));
  const theirs = new Set<string>();
  for (const turn of ctx.customerTurns) {
    for (const w of words(turn)) {
      const n = normalize(w);
      if ([...n].length >= 3 && !own.has(n) && !ctx.library.has(n)) theirs.add(n);
    }
  }
  return ws.some((w) => theirs.has(normalize(w)));
}

/**
 * Why a completion must be withheld, or null when it may be shown. Checked in
 * this order: identifier, conversation word, figure, date. With
 * allowSourcedFigures, figures and dates pass when the completion is worded
 * verbatim in a source sent with the request; identifiers and conversation
 * words never do.
 */
export function safetyCheck(completion: string, ctx: SafetyContext): WithheldReason | null {
  if (URL.test(completion) || EMAIL.test(completion)) return 'identifier';
  const ws = words(completion);
  if (conversation(ws, ctx)) return 'conversation';
  const reason = figure(completion, ws) ? 'figure' : date(ws) ? 'date' : null;
  if (reason && ctx.allowSourcedFigures && verbatimIn(completion, ctx.sent)) return null;
  return reason;
}
