import type { CannedResponse } from './types.ts';

// Retrieval-only normalization (not spelling): fold Arabic diacritics, tatweel,
// alef/hamza forms, taa marbuta and alef maqsura so lexical matching tolerates
// the variants agents and customers actually type.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

const STOP = new Set([
  // English function words and conversational filler
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have',
  'had', 'do', 'does', 'did', 'my', 'your', 'our', 'me', 'i', 'you', 'we', 'it', 'its', 'this', 'that', 'these', 'those',
  'will', 'would', 'can', 'could', 'should', 'may', 'with', 'from', 'by', 'at', 'as', 'if', 'up', 'so', 'not', 'no',
  'please', 'check', 'what', 'how', 'when', 'where', 'which', 'any', 'all', 'about', 'there', 'here', 'thank', 'thanks',
  // Arabic particles, pronouns and filler (normalized forms)
  'من', 'في', 'على', 'عن', 'الي', 'او', 'و', 'ان', 'هل', 'ما', 'لا', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'مع', 'كان',
  'انا', 'انت', 'هو', 'هي', 'نحن', 'لي', 'لك', 'يرجي', 'ممكن', 'اريد', 'شكرا',
]);

export function tokens(text: string): string[] {
  return (normalize(text).match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Arabic attaches the article and conjunctions; match on a light stem too. */
const stem = (t: string) => t.replace(/^(وال|بال|كال|فال|لل|ال)(?=\p{L}{3})/u, '');

export interface Rankable {
  id: string;
  text: string;
}

export type Ranked<T> = T & { score: number };

/**
 * BM25-lite over a small collection with weighted queries. Embeddings can
 * replace this behind the same signature.
 */
export function rank<T extends Rankable>(items: T[], queries: [string, number][], k: number, threshold: number): Ranked<T>[] {
  const docs = items.map((item) => ({ item, terms: tokens(item.text).map(stem) }));
  const avg = docs.reduce((n, d) => n + d.terms.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
  const query = queries.flatMap(([text, w]) => tokens(text).map((t) => [stem(t), w] as const));

  return docs
    .map(({ item, terms }) => {
      let score = 0;
      for (const [q, w] of query) {
        const tf = terms.filter((t) => t === q).length;
        if (!tf) continue;
        score += w * idf(q) * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (terms.length / avg))));
      }
      return { ...item, score };
    })
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export type Retrieved = Ranked<CannedResponse>;

/** Canned responses: the customer's last message weighs 1.0, the agent's prefix 0.5. */
export function retrieve(library: CannedResponse[], customer: string, prefix: string, k = 3, threshold = 0.5): Retrieved[] {
  return rank(library, [[customer, 1], [prefix, 0.5]], k, threshold);
}

export interface KbArticle {
  id: string;
  lang: 'en' | 'ar';
  title: string;
  body: string;
}

export interface KbPassage extends Rankable {
  lang: 'en' | 'ar';
}

/** Splits articles into passages of up to two sentences, each prefixed with its title. */
export function kbPassages(articles: KbArticle[]): KbPassage[] {
  return articles.flatMap((a) => {
    const sentences = a.body.match(/[^.!?\u061F]+[.!?\u061F]?/gu)?.map((s) => s.trim()).filter(Boolean) ?? [];
    const out: KbPassage[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      out.push({ id: `kb:${a.id}#${i / 2}`, lang: a.lang, text: `${a.title}: ${sentences.slice(i, i + 2).join(' ')}` });
    }
    return out;
  });
}

/**
 * Minimum score for a knowledge base passage. Calibrated by test/server/kb.test.ts:
 * clear questions about an article pass, greetings and off-topic messages don't.
 * A weak match is worse than none, so this is deliberately high.
 */
export const KB_THRESHOLD = 4;

/** Knowledge base passages: only the customer's last message, and only strong matches. */
export function retrieveKb(passages: KbPassage[], customer: string, k = 2, threshold = KB_THRESHOLD): Ranked<KbPassage>[] {
  return rank(passages, [[customer, 1]], k, threshold);
}
