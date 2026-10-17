import { COMPLETION_EXAMPLES, COMPLETION_SYSTEM_MESSAGE } from './completion-prompt';
import { SPELLING_EXAMPLES, SPELLING_SYSTEM_MESSAGE } from './spelling-prompt';
import { trace } from './trace';

const MODEL = 'gpt-4.1-mini';

export interface SpellingRequest {
  draft: string;
  caretOffset: number | undefined;
  llmContext: string;
  customWords: string[];
  ignoredWords: string[];
}

export interface CompletionRequest {
  draft: string;
  caretOffset: number;
  isCaretOnNewLine: boolean;
  llmContext: string;
}

export interface Mistake {
  word: string;
  context: string;
  fixes: string[];
  isSure: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LLMResult<T> = { answer: T } | { error: string };

export async function checkSpellingWithLLM(apiKey: string, request: SpellingRequest, signal: AbortSignal): Promise<LLMResult<Mistake[]>> {
  const userMessage = buildSpellingMessage(request);
  trace('llm', 'spelling: user message', userMessage);
  const reply = await askLLM(apiKey, [{ role: 'system', content: SPELLING_SYSTEM_MESSAGE }, ...SPELLING_EXAMPLES, { role: 'user', content: userMessage }], signal);
  trace('llm', 'spelling: raw reply', reply);
  if ('error' in reply) {
    return reply;
  }
  const mistakes = parseMistakes(reply.answer);
  return mistakes === null ? { error: `unreadable answer: ${reply.answer}` } : { answer: mistakes };
}

export async function completeDraftWithLLM(apiKey: string, request: CompletionRequest, signal: AbortSignal): Promise<LLMResult<string>> {
  const userMessage = buildCompletionMessage(request);
  trace('llm', 'completion: user message', userMessage);
  const reply = await askLLM(apiKey, [{ role: 'system', content: COMPLETION_SYSTEM_MESSAGE }, ...COMPLETION_EXAMPLES, { role: 'user', content: userMessage }], signal);
  trace('llm', 'completion: raw reply', reply);
  if ('error' in reply) {
    return reply;
  }
  const completion = parseCompletion(reply.answer);
  return completion === null ? { error: `unreadable answer: ${reply.answer}` } : { answer: completion };
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

async function askLLM(apiKey: string, messages: ChatMessage[], signal: AbortSignal): Promise<LLMResult<string>> {
  if (!apiKey) {
    trace('llm', 'no API key: request skipped');
    return { error: 'no API key' };
  }
  const startedAt = performance.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ChatCompletion;
      const error = `HTTP ${response.status}${body.error?.message ? `: ${body.error.message}` : ''}`;
      trace('llm', `${error} after ${Math.round(performance.now() - startedAt)} ms`);
      return { error };
    }
    const completion = (await response.json()) as ChatCompletion;
    trace('llm', `answered in ${Math.round(performance.now() - startedAt)} ms`);
    const content = completion.choices?.[0]?.message?.content;
    return content ? { answer: content } : { error: 'empty answer' };
  } catch (error) {
    trace('llm', `failed after ${Math.round(performance.now() - startedAt)} ms (aborted, timeout or network)`, error);
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export function buildSpellingMessage(request: SpellingRequest): string {
  return [
    request.llmContext,
    bulletList('Custom words', request.customWords),
    bulletList('Ignored words', request.ignoredWords),
    `Draft:\n${draftWithCaret(request.draft, request.caretOffset)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  function bulletList(title: string, items: string[]): string {
    return items.length ? `${title}:\n${items.map((item) => `- ${item}`).join('\n')}` : '';
  }
}

export function buildCompletionMessage(request: CompletionRequest): string {
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

export function parseCompletion(reply: string): string | null {
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
    context: raw.context,
    fixes,
    isSure: raw.sure === true,
  };
  return [mistake];
}
