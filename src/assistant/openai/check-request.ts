import type { Turn } from '../types';
import { askOpenAi } from './client';

export interface CheckRequest {
  draft: string;
  textBeforeCaret: string | null;
  conversation: Turn[];
  cannedResponses: string[];
  articles: string[];
  customWords: string[];
}

export interface Mistake {
  word: string;
  fixes: string[];
  sure: boolean;
}

export interface CheckAnswer {
  mistakes: Mistake[];
  completion: string;
}

const INSTRUCTIONS = `You help a customer support agent write a chat reply, in English or Arabic.
Answer with JSON only: {"mistakes": [{"word": "...", "fixes": ["..."], "sure": true}], "completion": "..."}

mistakes: every misspelled word in the draft, exactly as written there, with up to 3 fixes, best first.
"sure": true only when the word is clearly a typo and there is only one word it can be.
Never report names, words the customer wrote, codes, links, emails, numbers, or the custom words.

completion: only when "Continue after" is given. The text that goes right after it, nothing that is already there.
If it stops in the middle of a word, start with the rest of that word; if it stops after a word, start with a space.
At most one short sentence, in the draft's language. Use the canned responses and articles when they fit.
Empty when not asked or when you are not sure what comes next.`;

export async function requestCheck(apiKey: string, request: CheckRequest, signal: AbortSignal): Promise<CheckAnswer | null> {
  const reply = await askOpenAi({ apiKey, instructions: INSTRUCTIONS, message: buildMessage(request), signal, timeoutMs: 5000, answerAsJson: true });
  const answer = reply === null ? null : parseAnswer(reply);
  if (!answer) return null;
  return { mistakes: answer.mistakes, completion: cleanCompletion(answer.completion, request.textBeforeCaret) };
}

function buildMessage(request: CheckRequest): string {
  const conversation = request.conversation.map((turn) => `${turn.role === 'customer' ? 'Customer' : 'Agent'}: ${turn.text}`).join('\n');
  return [
    bulletList('Canned responses', request.cannedResponses),
    bulletList('Articles', request.articles),
    bulletList('Custom words', request.customWords),
    `Conversation:\n${conversation}`,
    `Agent's draft:\n${request.draft}`,
    request.textBeforeCaret === null ? '' : `Continue after:\n${request.textBeforeCaret}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function bulletList(title: string, items: string[]): string {
  return items.length ? `${title}:\n${items.map((item) => `- ${item}`).join('\n')}` : '';
}

function parseAnswer(reply: string): CheckAnswer | null {
  try {
    const parsed = JSON.parse(reply) as { mistakes?: unknown; completion?: unknown };
    const rawMistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes : [];
    return {
      mistakes: rawMistakes.flatMap(toMistake),
      completion: typeof parsed.completion === 'string' ? parsed.completion : '',
    };
  } catch {
    return null;
  }
}

function toMistake(raw: { word?: unknown; fixes?: unknown; sure?: unknown } | null): Mistake[] {
  if (typeof raw?.word !== 'string' || !Array.isArray(raw.fixes)) return [];
  const word = raw.word;
  const fixes = raw.fixes.filter((fix): fix is string => typeof fix === 'string' && fix !== '' && fix !== word);
  return fixes.length ? [{ word, fixes, sure: raw.sure === true }] : [];
}

function cleanCompletion(completion: string, textBeforeCaret: string | null): string {
  if (textBeforeCaret === null) return '';
  const firstLine = completion.split('\n')[0];
  const endsWithSpace = /\s$/.test(textBeforeCaret);
  return (endsWithSpace ? firstLine.trimStart() : firstLine).trimEnd();
}
