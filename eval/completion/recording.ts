// Recorded model answers: keyed by everything the model sees, so a recording
// can never answer a prompt it wasn't made for.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompletionModel, GenerationOptions } from '../../server/types.ts';
import type { Reply } from './judge.ts';

export const RECORDINGS_DIR = 'eval/completion/recordings';

export interface Recording {
  case: string;
  key: string;
  raw: string;
  /** The reply the completion service made from `raw` at record time. */
  reply: Reply;
}

/** SHA-256 of the model name, the instructions, the user prompt and the generation options. */
export const recordKey = (model: string, system: string, user: string, opts: GenerationOptions = {}) =>
  createHash('sha256').update(JSON.stringify({ model, system, user, opts })).digest('hex');

export class NoRecording extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`no recording for key ${key.slice(0, 12)}…`);
    this.name = 'NoRecording';
    this.key = key;
  }
}

/** A model that answers from recordings, offline; it throws NoRecording for anything else. */
export function createReplayModel(name: string, recordings: readonly Recording[]): CompletionModel {
  const byKey = new Map(recordings.map((r) => [r.key, r.raw]));
  return {
    name,
    async complete(system, user, _signal, opts) {
      const key = recordKey(name, system, user, opts);
      const raw = byKey.get(key);
      if (raw === undefined) throw new NoRecording(key);
      return raw;
    },
  };
}

const fileOf = (model: string, dir: string) => join(dir, `${model}.jsonl`);

export function readRecordings(model: string, dir = RECORDINGS_DIR): Recording[] {
  const path = fileOf(model, dir);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Recording);
}

/** Replaces the model's recordings file (deleted cases don't linger). */
export function writeRecordings(model: string, recordings: readonly Recording[], dir = RECORDINGS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = fileOf(model, dir);
  writeFileSync(path, recordings.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
}

/** The models that have a recordings file. */
export const recordedModels = (dir = RECORDINGS_DIR): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -'.jsonl'.length)).sort() : [];
