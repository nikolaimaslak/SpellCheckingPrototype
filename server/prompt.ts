import type { Rankable } from './retrieval.ts';
import type { CannedResponse, Turn } from './types.ts';

export const SYSTEM_INSTRUCTION = [
  'You complete the unfinished sentence a contact-center agent is typing to a customer of a Saudi social insurance organization.',
  'Output ONLY the continuation of the agent\'s text: no quotes, no explanation, no repetition of what the agent already typed.',
  'Write at most one sentence, in the same language and script as the agent\'s text (Arabic or English).',
  'Prefer the wording of the approved responses when they fit. Use the knowledge base only for facts it states. Do not invent figures, dates or policies that are not in the approved responses, the knowledge base or the conversation.',
  'If nothing sensible can be added, output nothing.',
].join('\n');

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
