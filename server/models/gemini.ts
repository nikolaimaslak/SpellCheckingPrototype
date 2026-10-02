import type { CompletionModel } from '../types.ts';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

/**
 * Gemini over REST (generateContent). Tuned for latency: low temperature, a
 * short output, a newline stop and minimal thinking. The key travels only in
 * the request header and is never included in errors.
 */
export function createGeminiModel({ apiKey, model = GEMINI_MODEL, fetch: doFetch = fetch }: GeminiOptions): CompletionModel {
  return {
    name: model,
    async complete(system, user, signal) {
      const res = await doFetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 48,
            stopSequences: ['\n'],
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      });
      if (!res.ok) {
        // Status only: response bodies can echo request details.
        throw new Error(`Gemini request failed with HTTP ${res.status}`);
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    },
  };
}
