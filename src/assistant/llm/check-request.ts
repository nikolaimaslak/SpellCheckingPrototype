import { askLLM } from './client';
import { trace } from '../trace';

export interface CheckRequest {
  draft: string;
  shouldAskCompletion: boolean;
  isCaretOnNewLine?: boolean;
  conversation: string;
  cannedResponses: string[];
  articles: string[];
  customWords: string[];
  ignoredWords: string[];
}

export interface Mistake {
  word: string;
  context: string;
  fixes: string[];
  sure: boolean;
}

export interface CheckAnswer {
  mistakes: Mistake[];
  completion: string;
}

const SYSTEM_MESSAGE = `You help a customer support agent write a chat reply. Answer with JSON only, like in the examples.

Agent's draft:
Hi John we will update you details
Complete the draft.
→ {"mistakes": [{"word": "you", "context": "update you details", "fixes": ["your"], "sure": true}], "completion": " from the next payment cycle."}

Agent's draft:
Hi Sasha your request has been received
Complete the draft.
→ {"mistakes": [], "completion": " and will be processed soon."}

Agent's draft:
Hi Sasha
Complete the draft.
→ {"mistakes": [], "completion": ", your request has been received and will be processed soon."}

Agent's draft:
Hi Sasha,
Complete the draft. The agent is on a new line.
→ {"mistakes": [], "completion": "Your request has been received and will be processed soon."}

Agent's draft:
I will sen the form
Complete the draft.
→ {"mistakes": [{"word": "sen", "context": "will sen the", "fixes": ["send", "see"], "sure": false}], "completion": " to you by email."}

Agent's draft:
We will update update your details
→ {"mistakes": [{"word": "update update", "context": "will update update your", "fixes": ["update"], "sure": true}], "completion": ""}

Agent's draft:
Your contribution rec
Complete the draft.
→ {"mistakes": [], "completion": "ords are up to date."}

Canned responses:
- Your request has been received and will be processed within 3 working days; you will be notified by SMS once it is complete.
- Thank you for contacting us; is there anything else I can help you with today?

Agent's draft:
Hi John, your request
Complete the draft.
→ {"mistakes": [], "completion": " has been received and will be processed soon."}

Canned responses:
- Thank you for contacting us; is there anything else I can help you with today?

Agent's draft:
شكراً لتواصلك معنا
Complete the draft.
→ {"mistakes": [], "completion": "، هل يمكنني مساعدتك في شيء آخر؟"}

Rules:
mistakes: typos and real words wrong in their place, in the language they are written. A fix is the word the agent meant, never a different word; an unknown word with no spelling fix is a name, leave it. "word" and "context" are copied exactly from the draft; the word appears in the context once. "sure": true only when there is one clearly right fix: it replaces the word at once. A fix is one word with no punctuation, and never the word itself: a word whose only problem is a missing sign after it is not reported. Never report names, words the customer wrote, codes, links, emails, numbers, ALL CAPS, or the custom words; ignored words are reported with "sure": false.
completion: only when "Complete the draft." is given. One short sentence that continues the draft from its last character, never repeating or fixing what is typed, in the language of the draft's end. Use the canned responses and articles when they fit, shortened to one sentence. No personal data, numbers, dates or durations. Empty when you are not sure what comes next.`;

export async function checkDraftWithLLM(apiKey: string, request: CheckRequest, signal: AbortSignal): Promise<CheckAnswer | null> {
  const userMessage = buildUserMessage(request);
  trace('llm', 'check: user message', userMessage);
  const reply = await askLLM({ apiKey, systemMessage: SYSTEM_MESSAGE, userMessage, signal, timeoutMs: 5000, answerAsJson: true });
  trace('llm', 'check: raw reply', reply);
  return reply === null ? null : parseAnswer(reply);
}

function buildUserMessage(request: CheckRequest): string {
  return [
    bulletList('Canned responses', request.cannedResponses),
    bulletList('Articles', request.articles),
    bulletList('Custom words', request.customWords),
    bulletList('Ignored words', request.ignoredWords),
    `Conversation:\n${request.conversation}`,
    `Agent's draft:\n${request.draft}`,
    request.shouldAskCompletion ? `Complete the draft.${request.isCaretOnNewLine ? ' The agent is on a new line.' : ''}` : '',
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

function toMistake(raw: { word?: unknown; context?: unknown; fixes?: unknown; sure?: unknown } | null): Mistake[] {
  if (typeof raw?.word !== 'string' || typeof raw.context !== 'string' || !Array.isArray(raw.fixes)) {
    return [];
  }
  const fixes = raw.fixes.filter((fix): fix is string => typeof fix === 'string');
  return fixes.length ? [{ word: raw.word, context: raw.context, fixes, sure: raw.sure === true }] : [];
}
