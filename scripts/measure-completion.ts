// Measures inline completion against a running completion server: whether
// the word at the seam between the agent's text and the suggestion is right
// ("be" + "en" = "been", not "ben" or "be n"), how often nothing comes back,
// and latency. Made-up text only: with Gemini it is sent to Google.
// Usage: node scripts/measure-completion.ts [baseUrl]   (default http://127.0.0.1:5175)

interface Case {
  prefix: string;
  transcript?: { role: 'customer' | 'agent'; text: string }[];
  /** The word the agent is typing, as it should read after the suggestion (case-insensitive). */
  seamWord?: string;
}

const PENSION = [{ role: 'customer' as const, text: 'Hello, I submitted a request for my pension documents last week. When will it be processed?' }];
const RECORDS = [{ role: 'customer' as const, text: 'Also, can you check the status of my contribution records?' }];
const OLLAMA = [{ role: 'customer' as const, text: 'How does Ollama work?' }];
const AR = [{ role: 'customer' as const, text: 'هل يمكنك الاستعلام عن الاشتراكات الخاصة بي؟' }];

export const CASES: Case[] = [
  { prefix: "If it weren't for the arcane name you could have be", seamWord: 'been' },
  { prefix: "It hasn't been proce", transcript: PENSION, seamWord: 'processed' },
  { prefix: 'Before jumping into Ollam', transcript: OLLAMA, seamWord: 'Ollama' },
  { prefix: 'Your contribution rec', transcript: RECORDS, seamWord: 'records' },
  { prefix: 'Thank you for your pati', seamWord: 'patience' },
  { prefix: 'We will update your bank acc', seamWord: 'account' },
  { prefix: 'Please upload a copy of your national', seamWord: 'national' },
  { prefix: 'I have checked your contribution history and everyth', seamWord: 'everything' },
  { prefix: 'Thank you for contacting us, your request', transcript: PENSION, seamWord: 'request' },
  { prefix: 'Your contribution records', transcript: RECORDS, seamWord: 'records' },
  { prefix: 'I understand your concern about the delay', seamWord: 'delay' },
  { prefix: 'To update your details, please', seamWord: 'please' },
  { prefix: 'Thank you for waiting,', transcript: RECORDS },
  { prefix: 'Your request has been received. ', transcript: PENSION },
  { prefix: 'شكراً لتواصلك معنا، تم استلا', seamWord: 'استلام' },
  { prefix: 'سجل الاشتراكات الخاص بك محد', transcript: AR, seamWord: 'محدث' },
  { prefix: 'يرجى رفع صورة من الهوية الوطن', seamWord: 'الوطنية' },
  { prefix: 'شكراً لانتظارك، سجل الاشتراكات', transcript: AR, seamWord: 'الاشتراكات' },
  { prefix: 'يسعدني مساعدتك في طلبك', seamWord: 'طلبك' },
  { prefix: 'شكراً لتواصلك معنا،', transcript: AR },
];

const WORD = /[\p{L}\p{N}\p{M}]/u;

/** The word of `text` that spans index `at` (the last character of the prefix). */
function wordAt(text: string, at: number): string {
  let s = at;
  let e = at + 1;
  while (s > 0 && WORD.test(text[s - 1])) s--;
  while (e < text.length && WORD.test(text[e])) e++;
  return text.slice(s, e);
}

export type Verdict = 'ok' | 'wrong-seam' | 'spacing' | 'empty';

/** Judges one reply: the seam word, or the spacing after a prefix that ends a word. */
export function judge(c: Case, completion: string): Verdict {
  if (!completion) return 'empty';
  const text = c.prefix + completion;
  if (c.seamWord) return wordAt(text, c.prefix.length - 1).toLowerCase() === c.seamWord.toLowerCase() ? 'ok' : 'wrong-seam';
  const endsSpace = /\s$/u.test(c.prefix);
  if (endsSpace && /^\s/u.test(completion)) return 'spacing';
  if (!endsSpace && /^[\p{L}\p{N}]/u.test(completion)) return 'spacing';
  return 'ok';
}

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

async function main() {
  const base = process.argv[2] ?? 'http://127.0.0.1:5175';
  const health = await (await fetch(`${base}/health`)).json();
  console.log(`server: ${JSON.stringify(health)}\n`);
  const rows: { v: Verdict; ms: number; serverMs: number; withheld?: string }[] = [];
  for (const c of CASES) {
    const started = performance.now();
    const res = await fetch(`${base}/v1/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: c.prefix, transcript: c.transcript ?? [], sources: { transcript: true, canned: true, kb: true } }),
    });
    const ms = performance.now() - started;
    const body = (await res.json()) as { completion?: string; latencyMs?: number; withheld?: string };
    const v = judge(c, body.completion ?? '');
    rows.push({ v, ms, serverMs: body.latencyMs ?? NaN, withheld: body.withheld });
    console.log(`${v.padEnd(10)} ${String(Math.round(ms)).padStart(5)} ms  ${JSON.stringify(c.prefix)} → ${JSON.stringify(body.completion ?? '')}${body.withheld ? `  (withheld: ${body.withheld})` : ''}`);
  }
  const count = (v: Verdict) => rows.filter((r) => r.v === v).length;
  const ms = rows.map((r) => r.ms);
  console.log(`\n${rows.length} cases: ok ${count('ok')}, wrong seam ${count('wrong-seam')}, spacing ${count('spacing')}, empty ${count('empty')} (withheld ${rows.filter((r) => r.withheld).length})`);
  console.log(`latency (round trip): p50 ${Math.round(percentile(ms, 50))} ms, p95 ${Math.round(percentile(ms, 95))} ms`);
}

if (process.argv[1]?.endsWith('measure-completion.ts')) await main();
