// Completion and polish: straight calls from the page to OpenAI with the key
// typed on the page. Any failure (no key, bad key, timeout, abort) resolves to
// null: the field simply shows nothing.

export const MODEL = 'gpt-4.1-mini';

export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface CompletionRequest {
  /** The agent's text up to the caret. */
  prefix: string;
  transcript: Turn[];
  canned: string[];
  /** "Title: body" per article. */
  kb: string[];
}

export interface CompletionReply {
  completion: string;
}

export interface PolishReply {
  polished: string;
  changed: boolean;
}

export interface Server {
  complete(body: CompletionRequest, signal: AbortSignal): Promise<CompletionReply | null>;
  polish(text: string, signal: AbortSignal): Promise<PolishReply | null>;
}

const COMPLETE_PROMPT = `You help a customer support agent type a chat reply.
Continue the agent's draft from where it stops. Reply with only the new text, nothing that is already in the draft.
If the draft stops in the middle of a word, start with the rest of that word. If it stops after a word, start with a space.
At most one short sentence, in the draft's language. Use the canned responses and articles when they fit.
If you are not sure what comes next, reply with nothing.`;

const POLISH_PROMPT = `Fix spelling, grammar and punctuation in the customer support agent's draft.
Keep its meaning, language, tone, names, numbers and links. Reply with only the fixed draft.`;

const list = (title: string, items: string[]) => (items.length ? `${title}:\n${items.map((i) => `- ${i}`).join('\n')}\n\n` : '');

/** One chat request; the answer's text, or null on any failure. */
async function ask(apiKey: string, system: string, user: string, signal: AbortSignal, timeoutMs: number): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
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

export function openAiServer(apiKey: string): Server {
  return {
    async complete({ prefix, transcript, canned, kb }, signal) {
      const conversation = transcript.map((t) => `${t.role === 'customer' ? 'Customer' : 'Agent'}: ${t.text}`).join('\n');
      const user = `${list('Canned responses', canned)}${list('Articles', kb)}Conversation:\n${conversation}\n\nAgent's draft:\n${prefix}`;
      const answer = await ask(apiKey, COMPLETE_PROMPT, user, signal, 3000);
      // One line only; a draft ending in a space doesn't need another.
      const line = answer?.split('\n')[0] ?? '';
      const completion = /\s$/.test(prefix) ? line.trimStart() : line;
      return answer === null ? null : { completion: completion.trimEnd() };
    },
    async polish(text, signal) {
      const polished = await ask(apiKey, POLISH_PROMPT, text, signal, 8000);
      return polished === null ? null : { polished, changed: polished !== text };
    },
  };
}
