import { askLLM } from './client';
import { trace } from '../trace';

export interface CheckRequest {
  draft: string;
  textBeforeCaret: string | null;
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

const INSTRUCTIONS = `You help a customer support agent write a chat reply.
Answer with JSON only: {"mistakes": [{"word": "...", "context": "...", "fixes": ["..."], "sure": true}], "completion": "..."}

mistakes: every wrong word in the draft: typos, and real words that are wrong in their place ("you" that should be "your").
Judge a real word only by the words already written around it: never report a word because the sentence is not finished yet.
Only words that are wrong: never suggest a different style, tone or wording for a correct word (greetings like "Hi", "Hello" or "Dear" are never wrong, so never replace one with another).
A fix is the word the agent meant to type: the same word spelled right, or its right form. Never a different word with another meaning ("sasa" → "there" is not a fix). An unknown word that no spelling fix explains is most likely a name: leave it.
One entry per place: the same word in two places is two entries, each with its own context.
"word": exactly as written in the draft. "context": the word with one or two words around it, copied exactly from the draft, so the place can be found. The word must appear in the context only once: if the same word is nearby, take fewer words or words from the other side.
"fixes": up to 3 replacements for that one word, best first; each fix is one word. Never add words or punctuation, except this one case:
a correct word that must be followed by a punctuation sign that is missing (a comma after the name in "Hello John we"): report it with one fix, the same word with that sign ("John,"), and "sure": true. Names count here too. Only when the word itself has no mistake, and only when the sign is really absent in the draft: in "Hi John, I made" the comma is already there, so "John" is not reported.
Check each fix by putting it in place of the word in its context: the result must read correctly. A word that should be removed, not replaced, is not a mistake.
"sure": when true, the first fix replaces the word at once, without asking the agent. The ignored words are still reported when wrong, but always with "sure": false. So true only when the word is clearly wrong there and there is only one right fix; with two or more fixes, or when the word could be a name, always false (the missing punctuation case is always true).
Never report names, words the customer wrote, codes, links, emails, numbers, words with digits, words in ALL CAPS, or the custom words as wrong; the missing punctuation case above is the only exception.
Keep the agent's language: a fix is in the same language as the word it replaces; never translate.

completion: only when "Continue after" is given. The text that goes right after it, nothing that is already there.
If it stops in the middle of a word, start with the rest of that word; if it stops after a word, start with a space.
Continue the draft as written, even if it has typos: never repeat or rewrite words that are already there. Mistakes are fixed through "mistakes", so a fix never goes into the completion: after a misspelled last word, the completion starts with what comes after that word.
If punctuation is missing before your words (a comma after a greeting, a period after a finished sentence) and no mistake already adds it, start the completion with that punctuation sign.
After a comma (typed or yours), continue the same sentence: no capital letter, no new sentence.
At most one short sentence, in the language the agent is typing right before it, never another language. Use the canned responses and articles when they fit.
Never put in the completion: personal data (names, phone numbers, emails, addresses, ID or account numbers), order or case numbers, amounts of money, dates or how long something takes. Leave a general wording instead ("will be processed soon", not "within 3 working days").
Empty when not asked or when you are not sure what comes next.`;

export async function requestCheck(apiKey: string, request: CheckRequest, signal: AbortSignal): Promise<CheckAnswer | null> {
  const message = buildMessage(request);
  trace('llm', 'check: message sent to the model', message);
  const reply = await askLLM({ apiKey, instructions: INSTRUCTIONS, message, signal, timeoutMs: 5000, answerAsJson: true });
  trace('llm', 'check: raw reply', reply);
  return reply === null ? null : parseAnswer(reply);
}

function buildMessage(request: CheckRequest): string {
  return [
    bulletList('Canned responses', request.cannedResponses),
    bulletList('Articles', request.articles),
    bulletList('Custom words', request.customWords),
    bulletList('Ignored words', request.ignoredWords),
    `Conversation:\n${request.conversation}`,
    `Agent's draft:\n${request.draft}`,
    request.textBeforeCaret === null ? '' : `Continue after:\n${request.textBeforeCaret}\n\n${caretNote(request.textBeforeCaret)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function caretNote(textBeforeCaret: string): string {
  if (/\s$/.test(textBeforeCaret)) {
    return 'It ends with a space: the completion starts a new word, or with the punctuation sign that is missing before it.';
  }
  const unfinishedWord = textBeforeCaret.match(/[\p{L}\p{M}]+$/u)?.[0];
  return unfinishedWord
    ? `It ends with "${unfinishedWord}" and no space. "${unfinishedWord}" is already typed: the completion never writes it again. If it is cut short, start with the rest of it (after "hel": "lo, ..."); if it is a whole word, start with a space and the word that comes next (after "I made": " a note ...").`
    : 'Start the completion with a space.';
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
