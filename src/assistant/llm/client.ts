import { trace } from '../trace';

export const MODEL = 'gpt-4.1-mini';

interface Question {
  apiKey: string;
  instructions: string;
  message: string;
  signal: AbortSignal;
  timeoutMs: number;
  answerAsJson?: boolean;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

export async function askLLM(question: Question): Promise<string | null> {
  if (!question.apiKey) {
    trace('openai', 'no API key: request skipped');
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
          { role: 'system', content: question.instructions },
          { role: 'user', content: question.message },
        ],
      }),
      signal: AbortSignal.any([question.signal, AbortSignal.timeout(question.timeoutMs)]),
    });
    if (!response.ok) {
      trace('openai', `HTTP ${response.status} after ${Math.round(performance.now() - startedAt)} ms`);
      return null;
    }
    const completion = (await response.json()) as ChatCompletion;
    trace('openai', `answered in ${Math.round(performance.now() - startedAt)} ms`);
    return completion.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    trace('openai', `failed after ${Math.round(performance.now() - startedAt)} ms (aborted, timeout or network)`, error);
    return null;
  }
}
