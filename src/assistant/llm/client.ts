import { trace } from '../trace';

export const MODEL = 'gpt-4.1-mini';

interface LLMQuestion {
  apiKey: string;
  systemMessage: string;
  userMessage: string;
  signal: AbortSignal;
  timeoutMs: number;
  answerAsJson?: boolean;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

export async function askLLM(question: LLMQuestion): Promise<string | null> {
  if (!question.apiKey) {
    trace('llm', 'no API key: request skipped');
    return null;
  }
  const startedAt = performance.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${question.apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        ...(question.answerAsJson && { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: question.systemMessage },
          { role: 'user', content: question.userMessage },
        ],
      }),
      signal: AbortSignal.any([question.signal, AbortSignal.timeout(question.timeoutMs)]),
    });
    if (!response.ok) {
      trace('llm', `HTTP ${response.status} after ${Math.round(performance.now() - startedAt)} ms`);
      return null;
    }
    const completion = (await response.json()) as ChatCompletion;
    trace('llm', `answered in ${Math.round(performance.now() - startedAt)} ms`);
    return completion.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    trace('llm', `failed after ${Math.round(performance.now() - startedAt)} ms (aborted, timeout or network)`, error);
    return null;
  }
}
