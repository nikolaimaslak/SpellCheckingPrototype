// Dev stand-in for the Intelligence Engine: inline completion and assistance
// telemetry. Usage: npm run server   (env: GEMINI_API_KEY, COMPLETION_MODEL=gemini|fake, PORT)
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete } from './complete.ts';
import { createFakeModel } from './models/fake.ts';
import { createGeminiModel } from './models/gemini.ts';
import { appendEvents, readEvents, renderSummary, summarize } from './telemetry.ts';
import type { CannedResponse, CompletionModel } from './types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (KEY=value lines); real environment variables win.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const PORT = Number(process.env.PORT ?? 5175);
const MODE = process.env.COMPLETION_MODEL ?? 'gemini';
const EVENTS = join(ROOT, 'telemetry/events.jsonl');
const library = (JSON.parse(readFileSync(join(ROOT, 'server/data/canned.json'), 'utf8')) as { responses: CannedResponse[] }).responses;

let model: CompletionModel | null = null;
if (MODE === 'fake') model = createFakeModel();
else if (process.env.GEMINI_API_KEY) model = createGeminiModel({ apiKey: process.env.GEMINI_API_KEY });

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

createServer(async (req, res) => {
  // Dev only: the demo uses the Vite proxy, the Agent Desktop loader calls cross-origin.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-private-network', 'true');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const path = (req.url ?? '').split('?')[0];
  try {
    if (req.method === 'POST' && path === '/v1/complete') {
      const result = await complete(await readJson(req), { model, library });
      return send(res, result.status, result.body);
    }
    if (req.method === 'POST' && path === '/v1/events') {
      return send(res, 200, { stored: appendEvents(EVENTS, await readJson(req)) });
    }
    if (req.method === 'GET' && path === '/summary') {
      return send(res, 200, renderSummary(summarize(readEvents(EVENTS))), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, model: model?.name ?? null });
    }
    send(res, 404, { error: 'not found' });
  } catch {
    send(res, 400, { error: 'bad request' });
  }
}).listen(PORT, () => {
  console.log(`completion server on http://localhost:${PORT}  model: ${model?.name ?? 'unavailable (set GEMINI_API_KEY or COMPLETION_MODEL=fake)'}`);
});
