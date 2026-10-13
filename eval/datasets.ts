// Loads the evaluation datasets through their manifest. Every data file must
// be listed with its provenance and sha256; an unlisted file or a changed
// hash fails the run, so no result rests on data nobody reviewed. Private
// datasets live in the gitignored private/ directory under their own manifest.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from './error-types.ts';
import { parseJsonl, readWordFile } from './io.ts';
import type { Message } from './types.ts';
import { fromTsv, type WordEntry } from './words.ts';

export type DatasetKind = 'typos' | 'clean' | 'injected' | 'wordlist' | 'public' | 'private';

export interface ManifestEntry {
  file: string;
  kind: DatasetKind;
  lang: Lang | 'mixed';
  source: string;
  license: string;
  sha256: string;
  /** Custom dictionary file (relative to the manifest), if the data is evaluated with one. */
  customWords?: string;
  /** For generated data: how to regenerate it. */
  generator?: { command: string; version: number; seed: number; from: string; options: Record<string, unknown> };
}

export interface Manifest {
  datasets: ManifestEntry[];
}

export interface Dataset {
  name: string;
  entry: ManifestEntry;
  messages: Message[];
  customWords: string[];
}

export interface WordList {
  name: string;
  entry: ManifestEntry;
  words: WordEntry[];
}

export class ManifestError extends Error {}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

const DATA = /\.(jsonl|tsv)$/;

export function readManifest(dir: string): Manifest {
  const path = join(dir, 'MANIFEST.json');
  if (!existsSync(path)) return { datasets: [] };
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** Checks that every data file in `dir` is listed and unchanged; returns the listed entries. */
export function verify(dir: string, kindOverride?: DatasetKind): ManifestEntry[] {
  const manifest = readManifest(dir);
  const listed = new Map(manifest.datasets.map((e) => [e.file, e]));
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => DATA.test(f)) : [];
  const unlisted = files.filter((f) => !listed.has(f));
  if (unlisted.length) throw new ManifestError(`not in ${join(dir, 'MANIFEST.json')}: ${unlisted.map((f) => join(dir, f)).join(', ')}`);
  for (const e of manifest.datasets) {
    const path = join(dir, e.file);
    if (!existsSync(path)) throw new ManifestError(`listed in the manifest but missing: ${path}`);
    const actual = sha256(readFileSync(path));
    if (actual !== e.sha256) throw new ManifestError(`hash mismatch for ${path}: the manifest has ${e.sha256.slice(0, 12)}…, the file is ${actual.slice(0, 12)}…`);
  }
  return manifest.datasets.map((e) => (kindOverride ? { ...e, kind: kindOverride } : e));
}

export interface LoadedData {
  datasets: Dataset[];
  wordLists: WordList[];
}

/** Loads the committed datasets and, when present, the private ones. */
export function loadAll(dir = 'eval/datasets'): LoadedData {
  const entries = [
    ...verify(dir).map((entry) => ({ entry, dir })),
    ...verify(join(dir, 'private'), 'private').map((entry) => ({ entry, dir: join(dir, 'private') })),
  ];
  const datasets: Dataset[] = [];
  const wordLists: WordList[] = [];
  for (const { entry, dir: base } of entries) {
    const path = join(base, entry.file);
    const name = entry.file.replace(DATA, '');
    if (entry.file.endsWith('.tsv')) {
      wordLists.push({ name, entry, words: fromTsv(readFileSync(path, 'utf8')) });
    } else {
      const customWords = entry.customWords ? readWordFile(join(base, entry.customWords)) : [];
      const messages = parseJsonl(readFileSync(path, 'utf8'), path) as Message[];
      // Unscored words are for imported corpora whose edits go beyond spelling; curated data must label every word.
      if (entry.kind !== 'private') {
        const m = messages.find((msg) => msg.labels?.some((l) => l.gold === 'unscored'));
        if (m) throw new ManifestError(`${name} message ${m.id}: the unscored label is only allowed in private datasets`);
      }
      datasets.push({ name, entry, messages, customWords });
    }
  }
  return { datasets, wordLists };
}
