// Reading and writing evaluation files, and the commands' argument parsing.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { Message } from './types.ts';

/** Messages from a `.txt` file (one per non-empty line) or a `.jsonl` dataset. */
export function readMessages(path: string): Message[] {
  const text = readFileSync(path, 'utf8');
  if (extname(path) === '.txt') {
    return text
      .split('\n')
      .map((line, i) => ({ id: String(i + 1), text: line.trim() }))
      .filter((m) => m.text);
  }
  if (extname(path) === '.jsonl') return parseJsonl(text, path);
  throw new Error(`${path}: expected a .txt or .jsonl file`);
}

export function parseJsonl(text: string, name: string): Message[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => {
      let m: Message;
      try {
        m = JSON.parse(line) as Message;
      } catch {
        throw new Error(`${name} line ${i + 1}: not valid JSON`);
      }
      if (typeof m.id !== 'string' || typeof m.text !== 'string') throw new Error(`${name} line ${i + 1}: needs a string "id" and "text"`);
      return m;
    });
}

/** One JSON object per line, keys in a fixed order, so regenerated files are byte-identical. */
export const toJsonl = (messages: Message[]) =>
  messages.map((m) => JSON.stringify(m.labels?.length ? { id: m.id, text: m.text, labels: m.labels } : { id: m.id, text: m.text })).join('\n') + '\n';

/** `--name value` and `--flag` options plus positional arguments. */
export function parseArgs(argv: string[], flags: string[] = []): { options: Record<string, string | true>; positional: string[] } {
  const options: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) positional.push(a);
    else if (flags.includes(a.slice(2))) options[a.slice(2)] = true;
    else {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${a} needs a value`);
      options[a.slice(2)] = value;
    }
  }
  return { options, positional };
}

/** The committed custom dictionary the datasets are evaluated with (one word per line, # comments). */
export const readWordFile = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
