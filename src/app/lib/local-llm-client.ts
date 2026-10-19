import type { LLMClient } from '../../assistant';

export const LLM_URL = 'http://127.0.0.1:8000/v1/chat/completions';
const MODEL = 'google/gemma-4-31B-it';

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

export const localLLMClient: LLMClient = {
  async ask(messages, signal) {
    try {
      const response = await fetch(LLM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ChatCompletion;
        return { error: `HTTP ${response.status}${body.error?.message ? `: ${body.error.message}` : ''}` };
      }
      const chatCompletion = (await response.json()) as ChatCompletion;
      const content = chatCompletion.choices?.[0]?.message?.content;
      return content ? { answer: content } : { error: 'empty answer' };
    } catch (error) {
      return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  },
};
