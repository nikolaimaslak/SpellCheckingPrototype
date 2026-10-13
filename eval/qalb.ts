// Imports an ARETA-tagged alignment file (CAMeL Lab's arabic-gec release:
// data/areta_tags/<variant>/<set>/<set>_<split>.areta+.nopnx.txt) as a
// private spelling dataset. Each line aligns a source word with its correction
// and an ARETA error tag; sentences are separated by blank lines.
//
//   UC (unchanged)                          → no label: gold correct
//   only REPLACE_O… parts, one word to one  → misspelled, intended = the correction
//   anything else (grammar, word choice,    → unscored, on every source word
//     merge, split, deletion, unknown)
//   empty source (an insertion)             → nothing
//
// A label on a word the tokenizer produces no word for (one letter, digits) is
// dropped and counted: the composer never checks that word, so it can't be
// measured. A sentence whose labelled word the tokenizer splits is skipped.
//
// Licensed corpora (QALB) are for internal evaluation only: the output goes to
// the gitignored private directory, with the corpus license beside it, and the
// benchmark reports it as aggregates only.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest, sha256, type ManifestEntry } from './datasets.ts';
import { toJsonl } from './io.ts';
import type { Label, Message } from './types.ts';

export const CONVERTER_VERSION = 1;

export interface AretaLine {
  source: string;
  target: string;
  tag: string;
}

export interface ImportCounts {
  messages: number;
  correct: number;
  misspelled: number;
  unscored: number;
  /** Labels on words the tokenizer never produces (dropped). */
  dropped: number;
  skipped: number;
}

export interface ImportResult {
  messages: Message[];
  counts: ImportCounts;
}

/** A tokenizer word: its text and flat offset (the project's tokenizer in practice). */
export type WordsOf = (text: string) => { text: string; start: number }[];

const words = (s: string) => s.split(' ').filter(Boolean);

/** Splits an ARETA file into sentences of aligned lines, without the header. */
export function parseAreta(text: string): AretaLine[][] {
  const sentences: AretaLine[][] = [];
  let current: AretaLine[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim() === '') {
      if (current.length) sentences.push(current);
      current = [];
      continue;
    }
    const [source = '', target = '', tag] = raw.split('\t');
    if (tag === undefined) continue; // the SOURCE⇥TARGET header
    current.push({ source: source.trim(), target: target.trim(), tag: tag.trim() });
  }
  if (current.length) sentences.push(current);
  return sentences;
}

/** Every part of the tag is an orthographic replacement (hamza, ta marbuta, alif maqsura, characters). */
export const isOrthographic = (tag: string) => tag.split('+').every((part) => part.startsWith('REPLACE_O'));

/** One sentence as a message: source words joined by spaces, labelled by tag. */
export function toMessage(id: string, lines: AretaLine[]): Message {
  let text = '';
  const labels: Label[] = [];
  for (const { source, target, tag } of lines) {
    const from = words(source);
    if (!from.length) continue; // an insertion: nothing typed
    const to = words(target);
    const spelling = tag !== 'UC' && isOrthographic(tag) && from.length === 1 && to.length === 1 && from[0] !== to[0];
    for (const word of from) {
      if (text) text += ' ';
      const start = text.length;
      text += word;
      if (tag === 'UC') continue;
      labels.push(spelling ? { start, word, gold: 'misspelled', intended: to[0] } : { start, word, gold: 'unscored' });
    }
  }
  return labels.length ? { id, text, labels } : { id, text };
}

/** Every label sits on a word the tokenizer produces, with the same text. */
export function aligned(message: Message, wordsOf: WordsOf): boolean {
  const byStart = new Map(wordsOf(message.text).map((w) => [w.start, w.text]));
  return (message.labels ?? []).every((l) => byStart.get(l.start) === l.word);
}

/**
 * Converts parsed sentences. Labels on words the tokenizer never produces are
 * dropped and counted; a sentence whose remaining labels don't line up with
 * the tokenizer (a labelled word it splits) is skipped and counted.
 */
export function convert(text: string, name: string, wordsOf: WordsOf, limit?: number): ImportResult {
  const sentences = parseAreta(text).slice(0, limit ?? Infinity);
  const counts: ImportCounts = { messages: 0, correct: 0, misspelled: 0, unscored: 0, dropped: 0, skipped: 0 };
  const messages: Message[] = [];
  sentences.forEach((lines, i) => {
    const built = toMessage(`${name}-${i + 1}`, lines);
    const tokens = wordsOf(built.text);
    const covered = (l: Label) => tokens.some((t) => t.start < l.start + l.word.length && l.start < t.start + t.text.length);
    const kept = (built.labels ?? []).filter(covered);
    const message: Message = kept.length ? { ...built, labels: kept } : { id: built.id, text: built.text };
    if (!message.text || !aligned(message, wordsOf)) {
      counts.skipped++;
      return;
    }
    counts.dropped += (built.labels?.length ?? 0) - kept.length;
    messages.push(message);
    counts.messages++;
    counts.misspelled += kept.filter((l) => l.gold === 'misspelled').length;
    counts.unscored += kept.filter((l) => l.gold === 'unscored').length;
    counts.correct += tokens.length - kept.length;
  });
  return { messages, counts };
}

export interface WriteOptions {
  /** The private dataset directory. */
  dir: string;
  name: string;
  input: string;
  source: string;
  license: string;
  licenseFile: string;
  limit?: number;
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Writes `<name>.jsonl`, `<name>.LICENSE.txt` and the manifest entry; nothing is written if the license file can't be read. */
export function writePrivate(messages: Message[], o: WriteOptions): { data: string; license: string; entry: ManifestEntry } {
  if (!NAME.test(o.name)) throw new Error(`invalid dataset name "${o.name}": use lowercase letters, digits and hyphens`);
  if (!existsSync(o.licenseFile)) throw new Error(`license file not found: ${o.licenseFile}`);
  const licenseText = readFileSync(o.licenseFile);
  mkdirSync(o.dir, { recursive: true });

  const data = join(o.dir, `${o.name}.jsonl`);
  const body = toJsonl(messages);
  writeFileSync(`${data}.tmp`, body);
  renameSync(`${data}.tmp`, data);
  const license = join(o.dir, `${o.name}.LICENSE.txt`);
  writeFileSync(license, licenseText);

  const entry: ManifestEntry = {
    file: `${o.name}.jsonl`,
    kind: 'private',
    lang: 'ar',
    source: o.source,
    license: o.license,
    sha256: sha256(body),
    // Deterministic: the seed is unused.
    generator: { command: 'npm run eval:qalb', version: CONVERTER_VERSION, seed: 0, from: o.input, options: o.limit ? { limit: o.limit } : {} },
  };
  const manifest = readManifest(o.dir);
  const datasets = [...manifest.datasets.filter((e) => e.file !== entry.file), entry];
  const path = join(o.dir, 'MANIFEST.json');
  writeFileSync(`${path}.tmp`, JSON.stringify({ ...manifest, datasets }, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
  return { data, license, entry };
}

