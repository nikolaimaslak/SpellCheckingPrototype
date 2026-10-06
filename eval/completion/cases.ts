// The completion case dataset (eval/completion/cases.jsonl): made-up,
// off-domain chat in English, Arabic and mixed Arabic/English, with what a
// suggestion must get right. Plain Node: imports only node: modules.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CASE_LANGS = ['en', 'ar', 'mixed'] as const;
export const CATEGORIES = ['mid-word', 'finished-word', 'after-punctuation', 'after-space', 'new-sentence', 'details'] as const;

export type CaseLang = (typeof CASE_LANGS)[number];
export type Category = (typeof CATEGORIES)[number];

export interface Turn {
  role: 'customer' | 'agent';
  text: string;
}

export interface CompletionCase {
  id: string;
  lang: CaseLang;
  category: Category;
  prefix: string;
  transcript?: Turn[];
  /** The word being typed, as it must read after the suggestion (letter case and Arabic diacritics ignored). */
  seamWord?: string;
  /** Whether a suggestion is expected (default true); reported, never judged. */
  expectShown?: boolean;
  /** Details that must not appear in a suggestion unless the context has them. */
  mustNotInvent?: string[];
}

export interface Dataset {
  cases: CompletionCase[];
  /** SHA-256 of the file: the baseline is tied to it. */
  hash: string;
}

export const CASES_PATH = 'eval/completion/cases.jsonl';

const isStr = (v: unknown): v is string => typeof v === 'string';

function validate(o: unknown, where: string): CompletionCase {
  const c = (o && typeof o === 'object' ? o : null) as Record<string, unknown> | null;
  const fail = (msg: string): never => {
    throw new Error(`${where}: ${msg}`);
  };
  if (!c) return fail('not a JSON object');
  if (!isStr(c.id) || !c.id) fail('id is required');
  if (!(CASE_LANGS as readonly unknown[]).includes(c.lang)) fail(`lang must be one of ${CASE_LANGS.join(', ')}`);
  if (!(CATEGORIES as readonly unknown[]).includes(c.category)) fail(`category must be one of ${CATEGORIES.join(', ')}`);
  if (!isStr(c.prefix) || !c.prefix.trim()) fail('prefix is required');
  if (c.transcript !== undefined) {
    if (!Array.isArray(c.transcript) || !c.transcript.every((t) => t && (t.role === 'customer' || t.role === 'agent') && isStr(t.text))) fail('transcript must be { role, text } turns');
  }
  if (c.seamWord !== undefined && (!isStr(c.seamWord) || !c.seamWord)) fail('seamWord must be a non-empty string');
  if (c.expectShown !== undefined && typeof c.expectShown !== 'boolean') fail('expectShown must be a boolean');
  if (c.mustNotInvent !== undefined && (!Array.isArray(c.mustNotInvent) || !c.mustNotInvent.every(isStr))) fail('mustNotInvent must be strings');
  return c as unknown as CompletionCase;
}

/** Parses the dataset text; throws naming the line on a malformed case or a duplicate id. */
export function parseCases(text: string, name = CASES_PATH): Dataset {
  const cases: CompletionCase[] = [];
  const seen = new Set<string>();
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const where = `${name}:${i + 1}`;
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      throw new Error(`${where}: invalid JSON`);
    }
    const c = validate(o, where);
    if (seen.has(c.id)) throw new Error(`${where}: duplicate id "${c.id}"`);
    seen.add(c.id);
    cases.push(c);
  });
  return { cases, hash: createHash('sha256').update(text).digest('hex') };
}

export const loadCases = (path = CASES_PATH): Dataset => parseCases(readFileSync(path, 'utf8'), path);
