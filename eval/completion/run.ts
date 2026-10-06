// Runs one case through the real completion service (server/complete.ts),
// with the server's own data, and captures what the model saw and answered.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { complete } from '../../server/complete.ts';
import { kbPassages, type KbArticle, type KbPassage } from '../../server/retrieval.ts';
import type { CannedResponse, CompletionModel } from '../../server/types.ts';
import type { CompletionCase } from './cases.ts';
import type { Reply } from './judge.ts';
import { NoRecording, recordKey } from './recording.ts';

export interface ServerData {
  library: CannedResponse[];
  kb: KbPassage[];
}

/** The canned responses and knowledge base, loaded as server/main.ts loads them. */
export function loadServerData(root = '.'): ServerData {
  const library = (JSON.parse(readFileSync(join(root, 'server/data/canned.json'), 'utf8')) as { responses: CannedResponse[] }).responses;
  const kb = kbPassages((JSON.parse(readFileSync(join(root, 'server/data/kb.json'), 'utf8')) as { articles: KbArticle[] }).articles);
  return { library, kb };
}

export interface CaseRun {
  /** null when the request failed or timed out. */
  reply: Reply | null;
  /** The model's raw answer and the key it would be recorded under; absent when the model wasn't reached. */
  raw?: string;
  key?: string;
  /** The user prompt the model received: conversation, sources and prefix. */
  user: string;
  ms: number;
  error?: string;
}

const SOURCES = { transcript: true, canned: true, kb: true };

/** One case through /v1/complete's handler. A missing recording is rethrown, never counted as a model error. */
export async function runCase(c: CompletionCase, model: CompletionModel, data: ServerData, timeoutMs = 5000): Promise<CaseRun> {
  let seen: { user: string; raw?: string; key: string; error?: unknown } = { user: '', key: '' };
  const spy: CompletionModel = {
    name: model.name,
    async complete(system, user, signal, opts) {
      seen = { user, key: recordKey(model.name, system, user, opts) };
      try {
        seen.raw = await model.complete(system, user, signal, opts);
        return seen.raw;
      } catch (err) {
        seen.error = err;
        throw err;
      }
    },
  };
  const started = performance.now();
  const res = await complete({ prefix: c.prefix, transcript: c.transcript ?? [], sources: SOURCES }, { model: spy, library: data.library, kb: data.kb, timeoutMs });
  const ms = performance.now() - started;
  if (seen.error instanceof NoRecording) throw seen.error;
  if (res.status !== 200) return { reply: null, user: seen.user, ms, error: (res.body as { error: string }).error };
  const { completion, edit, withheld } = res.body as Reply;
  return { reply: { completion, ...(edit ? { edit } : {}), ...(withheld ? { withheld } : {}) }, raw: seen.raw, key: seen.key, user: seen.user, ms };
}
