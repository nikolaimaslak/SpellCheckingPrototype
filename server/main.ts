// Dev stand-in for the Intelligence Engine: inline completion and assistance
// telemetry. Usage: npm run server   (env: GEMINI_API_KEY, COMPLETION_MODEL=auto|gemini|fake, PORT)
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete } from './complete.ts';
import { polish } from './polish.ts';
import { selectModel, sourcedFigures } from './model-select.ts';
import { appendEvents, readEvents, renderSummary, summarize } from './telemetry.ts';
import { kbPassages, type KbArticle } from './retrieval.ts';
import type { CannedResponse } from './types.ts';

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
const EVENTS = join(ROOT, 'telemetry/events.jsonl');
const library = (JSON.parse(readFileSync(join(ROOT, 'server/data/canned.json'), 'utf8')) as { responses: CannedResponse[] }).responses;
const kb = kbPassages((JSON.parse(readFileSync(join(ROOT, 'server/data/kb.json'), 'utf8')) as { articles: KbArticle[] }).articles);

const selection = selectModel(process.env);
const { model } = selection;
const figures = sourcedFigures(process.env);
if (selection.warning) console.warn(`warning: ${selection.warning}`);

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
      const result = await complete(await readJson(req), {
        model,
        library,
        kb,
        allowSourcedFigures: figures === 'allow',
        // The reason only: the withheld text never reaches the log.
        onWithheld: (reason, lang) => appendEvents(EVENTS, [{ type: 'completion-withheld', reason, ...(lang ? { lang } : {}) }]),
      });
      return send(res, result.status, result.body);
    }
    if (req.method === 'POST' && path === '/v1/polish') {
      const result = await polish(await readJson(req), { model });
      return send(res, result.status, result.body);
    }
    if (req.method === 'POST' && path === '/v1/events') {
      return send(res, 200, { stored: appendEvents(EVENTS, await readJson(req)) });
    }
    if (req.method === 'GET' && path === '/summary') {
      return send(res, 200, renderSummary(summarize(readEvents(EVENTS))), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, model: model?.name ?? null, mode: selection.mode, external: selection.external, sourcedFigures: figures });
    }
    send(res, 404, { error: 'not found' });
  } catch {
    send(res, 400, { error: 'bad request' });
  }
// Loopback only: the endpoint (and the key's quota) is never exposed to the network.
}).listen(PORT, '127.0.0.1', () => {
  const where = !model
    ? 'unavailable (COMPLETION_MODEL=gemini needs GEMINI_API_KEY)'
    : selection.external
      ? `${model.name} (typed text is sent to Google: use made-up text only)`
      : `${model.name} (offline test model: canned results, nothing leaves this machine)`;
  console.log(`completion server on http://localhost:${PORT}  model: ${where}`);
});
