import express, { type RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LLMRequestKind } from '../src/assistant/types.ts';
import { createOpenAIChatClient } from './openai-chat-client.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const LLM_TIMEOUT_MS = 20000;

const llmClient = createOpenAIChatClient(requireEnv('LLM_API_KEY'), requireEnv('MODEL'), requireEnv('LLM_URL'));
const credentials = Buffer.from(`${requireEnv('BASIC_AUTH_USER')}:${requireEnv('BASIC_AUTH_PASSWORD')}`);

const app = express();

app.use((request, response, next) => {
  const given = Buffer.from((request.headers.authorization ?? '').replace(/^Basic /, ''), 'base64');
  if (given.length === credentials.length && timingSafeEqual(given, credentials)) {
    next();
    return;
  }
  response.set('WWW-Authenticate', 'Basic realm="SpellCheckingPrototype"').sendStatus(401);
});

app.use(express.json({ limit: '1mb' }));
app.post('/api/autocorrection', forwardToLLM('spell-check'));
app.post('/api/autocompletion', forwardToLLM('auto-completion'));
app.use(express.static(DIST_DIR));
app.get('/{*path}', (_request, response) => {
  response.sendFile(join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}, serving ${DIST_DIR}`);
});

function forwardToLLM(requestKind: LLMRequestKind): RequestHandler {
  return async (request, response) => {
    const messages = (request.body as { messages?: unknown } | undefined)?.messages;
    if (!Array.isArray(messages)) {
      response.status(400).json({ error: 'body must be {"messages": [...]}' });
      return;
    }
    const startedAt = performance.now();
    const result = await llmClient.ask(messages, AbortSignal.timeout(LLM_TIMEOUT_MS), requestKind);
    console.log(`${requestKind}: ${'error' in result ? result.error : 'answered'} in ${Math.round(performance.now() - startedAt)} ms`);
    response.status('error' in result ? 502 : 200).json(result);
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Put it in .env (see .env.example).`);
    process.exit(1);
  }
  return value;
}
