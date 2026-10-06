import type { Rankable } from './retrieval.ts';
import type { CannedResponse, Turn } from './types.ts';

/**
 * The model's instructions. Details from the content sent (names, figures,
 * dates, identifiers) may be used, only as given there: production runs on a
 * local model so that suggestions can use customer data (Req 3.7 pending SV).
 */
export function systemInstruction(): string {
  return [
    'You complete the unfinished sentence a contact-center agent is typing to a customer of a Saudi social insurance organization.',
    'Return JSON with two fields. `word`: the last word of the agent\'s text, written out in full, whether or not the agent finished it (for example "Ollama" when the text ends with "Ollam", and "request" when it ends with "request"); an empty string only if the text ends with a space or punctuation. `rest`: the continuation after that word, starting with a space or punctuation as needed.',
    'Do not repeat earlier words the agent typed; only the current word goes in `word`.',
    "Write at most one sentence, in the same language and script as the agent's text (Arabic or English).",
    'Prefer the wording of the approved responses when they fit. Use the knowledge base only for facts it states. Do not invent policies that are not in the approved responses, the knowledge base or the conversation.',
    'Use names, numbers, amounts, dates, time periods, reference numbers, email addresses and links only as they appear in the conversation, the approved responses or the knowledge base; never invent them.',
    'If nothing sensible can be added, return an empty `word` and `rest`.',
  ].join('\n');
}

/** Gemini response schema for completion: the current word in full, and the rest. */
export const COMPLETION_SCHEMA = {
  type: 'OBJECT',
  properties: { word: { type: 'STRING' }, rest: { type: 'STRING' } },
  required: ['word', 'rest'],
};

const MAX_TURNS = 6;

/**
 * User content, stable parts first (approved responses, knowledge base, then
 * conversation) and the changing prefix last, so consecutive requests share a
 * prompt prefix.
 */
export function buildUserContent(prefix: string, transcript: Turn[] | null, canned: CannedResponse[] | null, kb: Rankable[] | null = null): string {
  const parts: string[] = [];
  if (canned?.length) parts.push('Approved responses:\n' + canned.map((c) => `- ${c.text}`).join('\n'));
  if (kb?.length) parts.push('Knowledge base:\n' + kb.map((p) => `- ${p.text}`).join('\n'));
  if (transcript?.length) {
    parts.push(
      'Conversation:\n' +
        transcript
          .slice(-MAX_TURNS)
          .map((t) => `${t.role === 'customer' ? 'Customer' : 'Agent'}: ${t.text}`)
          .join('\n'),
    );
  }
  parts.push(`Agent is typing:\n${prefix}`);
  return parts.join('\n\n');
}
