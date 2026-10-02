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

export interface Retrieved extends CannedResponse {
  score: number;
}

/**
 * BM25-lite over a small library: the customer's last message weighs 1.0, the
 * agent's prefix 0.5. Embeddings can replace this behind the same signature.
 */
export function retrieve(library: CannedResponse[], customer: string, prefix: string, k = 3, threshold = 0.5): Retrieved[] {
  const docs = library.map((r) => ({ r, terms: tokens(r.text).map(stem) }));
  const avg = docs.reduce((n, d) => n + d.terms.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
  const query = [...tokens(customer).map((t) => [stem(t), 1] as const), ...tokens(prefix).map((t) => [stem(t), 0.5] as const)];

  return docs
    .map(({ r, terms }) => {
      let score = 0;
      for (const [q, w] of query) {
        const tf = terms.filter((t) => t === q).length;
        if (!tf) continue;
        score += w * idf(q) * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (terms.length / avg))));
      }
      return { ...r, score };
    })
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
