import { AUTO_COMPLETION_EXAMPLES, AUTO_COMPLETION_SYSTEM_MESSAGE } from './auto-completion-prompt';
import { SPELL_CHECK_EXAMPLES, SPELL_CHECK_SYSTEM_MESSAGE } from './spell-check-prompt';
import { trace } from './trace';
import type { ChatMessage, LLMClient, LLMResult } from './types';

const LLM_TIMEOUT_MS = 5000;

export interface SpellCheckRequest {
  draft: string;
  caretOffset: number | undefined;
  llmContext: string;
  customDictionary: string[];
  ignoredWords: string[];
}

export interface AutoCompletionRequest {
  draft: string;
  caretOffset: number;
  isCaretOnNewLine: boolean;
  llmContext: string;
}

export interface Mistake {
  word: string;
  surroundingText: string;
  fixes: string[];
  isSure: boolean;
}

export async function spellCheckWithLLM(llmClient: LLMClient, request: SpellCheckRequest, signal: AbortSignal): Promise<LLMResult<Mistake[]>> {
  const userMessage = buildSpellCheckMessage(request);
  trace('llm', 'spell check: user message', userMessage);
  const reply = await askWithTimeout(llmClient, [{ role: 'system', content: SPELL_CHECK_SYSTEM_MESSAGE }, ...SPELL_CHECK_EXAMPLES, { role: 'user', content: userMessage }], signal);
  trace('llm', 'spell check: raw reply', reply);
  if ('error' in reply) {
    return reply;
  }
  const mistakes = parseMistakes(reply.answer);
  return mistakes === null ? { error: `unreadable answer: ${reply.answer}` } : { answer: mistakes };
}

export async function autoCompleteWithLLM(llmClient: LLMClient, request: AutoCompletionRequest, signal: AbortSignal): Promise<LLMResult<string>> {
  const userMessage = buildAutoCompletionMessage(request);
  trace('llm', 'auto-completion: user message', userMessage);
  const reply = await askWithTimeout(llmClient, [{ role: 'system', content: AUTO_COMPLETION_SYSTEM_MESSAGE }, ...AUTO_COMPLETION_EXAMPLES, { role: 'user', content: userMessage }], signal);
  trace('llm', 'auto-completion: raw reply', reply);
  if ('error' in reply) {
    return reply;
  }
  const autoCompletion = parseAutoCompletion(reply.answer);
  return autoCompletion === null ? { error: `unreadable answer: ${reply.answer}` } : { answer: autoCompletion };
}

async function askWithTimeout(llmClient: LLMClient, messages: ChatMessage[], signal: AbortSignal): Promise<LLMResult<string>> {
  const startedAt = performance.now();
  try {
    const reply = await llmClient.ask(messages, AbortSignal.any([signal, AbortSignal.timeout(LLM_TIMEOUT_MS)]));
    trace('llm', `${'error' in reply ? `failed: ${reply.error}` : 'answered'} after ${Math.round(performance.now() - startedAt)} ms`);
    return reply;
  } catch (error) {
    trace('llm', `failed after ${Math.round(performance.now() - startedAt)} ms`, error);
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export function buildSpellCheckMessage(request: SpellCheckRequest): string {
  return [
    request.llmContext,
    bulletList('Custom dictionary', request.customDictionary),
    bulletList('Ignored words', request.ignoredWords),
    `Draft:\n${draftWithCaret(request.draft, request.caretOffset)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  function bulletList(title: string, items: string[]): string {
    return items.length ? `${title}:\n${items.map((item) => `- ${item}`).join('\n')}` : '';
  }
}

export function buildAutoCompletionMessage(request: AutoCompletionRequest): string {
  return [
    request.llmContext,
    `Draft:\n${draftWithCaret(request.draft, request.caretOffset)}`,
    `Complete the draft at ‸ with one short sentence.${request.isCaretOnNewLine ? ' The writer is on a new line: start a new sentence with no leading space.' : ''}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function draftWithCaret(draft: string, caretOffset: number | undefined): string {
  if (caretOffset === undefined) {
    return draft;
  }
  return `${draft.slice(0, caretOffset)}‸${draft.slice(caretOffset)}`;
}

export function parseMistakes(reply: string): Mistake[] | null {
  try {
    const parsed = JSON.parse(reply) as { mistakes?: unknown };
    return Array.isArray(parsed.mistakes) ? parsed.mistakes.flatMap(toMistake) : [];
  } catch {
    return null;
  }
}

export function parseAutoCompletion(reply: string): string | null {
  try {
    const parsed = JSON.parse(reply) as { nextSentence?: unknown };
    return typeof parsed.nextSentence === 'string' ? parsed.nextSentence : '';
  } catch {
    return null;
  }
}

function toMistake(raw: Partial<Record<'word' | 'context' | 'fixes' | 'sure', unknown>> | null): Mistake[] {
  if (typeof raw?.word !== 'string' || typeof raw.context !== 'string' || !Array.isArray(raw.fixes)) {
    return [];
  }
  const fixes = raw.fixes.filter((fix): fix is string => typeof fix === 'string');
  if (!fixes.length) {
    return [];
  }
  const mistake: Mistake = {
    word: raw.word,
    surroundingText: raw.context,
    fixes,
    isSure: raw.sure === true,
  };
  return [mistake];
}
