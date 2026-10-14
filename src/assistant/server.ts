// Spelling, completion and polish: straight calls from the page to OpenAI
// with the key typed on the page. Any failure (no key, bad key, timeout,
// abort, unreadable answer) resolves to null: the field simply shows nothing.

export const MODEL = 'gpt-4.1-mini';

export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface CheckRequest {
  /** The whole draft. */
  text: string;
  /** The draft up to the caret when a completion is wanted, else null. */
  prefix: string | null;
  transcript: Turn[];
  canned: string[];
  /** "Title: body" per article. */
  kb: string[];
  /** Never reported as mistakes. */
  customWords: string[];
}

/** A misspelled word of the draft, exactly as written. */
export interface Mistake {
  word: string;
  /** Best first. */
  fixes: string[];
  /** A clear typo with one possible fix: safe to auto-correct. */
  sure: boolean;
}

export interface CheckReply {
  mistakes: Mistake[];
  /** The text that goes right after the caret; empty when not asked or unsure. */
  completion: string;
}

export interface PolishReply {
  polished: string;
  changed: boolean;
}

export interface Server {
  check(body: CheckRequest, signal: AbortSignal): Promise<CheckReply | null>;
  polish(text: string, signal: AbortSignal): Promise<PolishReply | null>;
}

const CHECK_PROMPT = `You help a customer support agent write a chat reply, in English or Arabic.
Answer with JSON only: {"mistakes": [{"word": "...", "fixes": ["..."], "sure": true}], "completion": "..."}

mistakes: every misspelled word in the draft, exactly as written there, with up to 3 fixes, best first.
"sure": true only when the word is clearly a typo and there is only one word it can be.
Never report names, words the customer wrote, codes, links, emails, numbers, or the custom words.

completion: only when "Continue after" is given. The text that goes right after it, nothing that is already there.
If it stops in the middle of a word, start with the rest of that word; if it stops after a word, start with a space.
At most one short sentence, in the draft's language. Use the canned responses and articles when they fit.
Empty when not asked or when you are not sure what comes next.`;

const POLISH_PROMPT = `Fix spelling, grammar and punctuation in the customer support agent's draft.
Keep its meaning, language, tone, names, numbers and links. Reply with only the fixed draft.`;

const list = (title: string, items: string[]) => (items.length ? `${title}:\n${items.map((i) => `- ${i}`).join('\n')}\n\n` : '');

/** One chat request; the answer's text, or null on any failure. */
async function ask(apiKey: string, system: string, user: string, signal: AbortSignal, timeoutMs: number, json = false): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        ...(json && { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

/** The model's JSON, keeping only well-formed parts. */
function parseCheck(answer: string): CheckReply | null {
  try {
    const raw = JSON.parse(answer) as { mistakes?: unknown; completion?: unknown };
    const mistakes = (Array.isArray(raw.mistakes) ? raw.mistakes : []).flatMap((m): Mistake[] => {
      if (typeof m?.word !== 'string' || !Array.isArray(m.fixes)) return [];
      const fixes = m.fixes.filter((f: unknown): f is string => typeof f === 'string' && f !== '' && f !== m.word);
      return fixes.length ? [{ word: m.word, fixes, sure: m.sure === true }] : [];
    });
    return { mistakes, completion: typeof raw.completion === 'string' ? raw.completion : '' };
  } catch {
    return null;
  }
}

export function openAiServer(apiKey: string): Server {
  return {
    async check({ text, prefix, transcript, canned, kb, customWords }, signal) {
      const conversation = transcript.map((t) => `${t.role === 'customer' ? 'Customer' : 'Agent'}: ${t.text}`).join('\n');
      const user =
        `${list('Canned responses', canned)}${list('Articles', kb)}${list('Custom words', customWords)}` +
        `Conversation:\n${conversation}\n\nAgent's draft:\n${text}` +
        (prefix === null ? '' : `\n\nContinue after:\n${prefix}`);
      const answer = await ask(apiKey, CHECK_PROMPT, user, signal, 5000, true);
      const reply = answer === null ? null : parseCheck(answer);
      if (!reply) return null;
      // One line only; a draft ending in a space doesn't need another.
      const line = prefix === null ? '' : reply.completion.split('\n')[0];
      const completion = prefix && /\s$/.test(prefix) ? line.trimStart() : line;
      return { mistakes: reply.mistakes, completion: completion.trimEnd() };
    },
    async polish(text, signal) {
      const polished = await ask(apiKey, POLISH_PROMPT, text, signal, 8000);
      return polished === null ? null : { polished, changed: polished !== text };
    },
  };
}
