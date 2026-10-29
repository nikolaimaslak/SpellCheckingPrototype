import type { LLMClient } from '../../assistant';

export const LLM_URL = 'https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions';
const MODEL = 'google.gemma-4-31b';

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

export function createLLMClient(apiKey: string, model = MODEL, url = LLM_URL): LLMClient {
  const llmClient: LLMClient = {
    async ask(messages, signal) {
      if (!apiKey) {
        return { error: 'no API key' };
      }
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
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
  return llmClient;
}
