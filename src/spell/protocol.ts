// Message protocol between the page and the spelling worker.

export type Lang = 'en' | 'ar';

export type SpellRequest =
  | { id: number; type: 'load'; langs: Lang[] }
  | { id: number; type: 'spell'; lang: Lang; word: string }
  | { id: number; type: 'suggest'; lang: Lang; word: string }
  | { id: number; type: 'add'; lang: Lang; word: string }
  | { id: number; type: 'check'; words: Partial<Record<Lang, string[]>> };

export interface LoadResult {
  loaded: { lang: Lang; ms: number }[];
  failed: { lang: Lang; reason: string }[];
}

export interface CheckResult {
  misspelled: Partial<Record<Lang, string[]>>;
  /** Words whose language is not loaded: neither correct nor misspelled. */
  unchecked: Partial<Record<Lang, string[]>>;
}

export interface ResultByType {
  load: LoadResult;
  spell: boolean;
  suggest: string[];
  add: null;
  check: CheckResult;
}

export type SpellReply =
  | { id: number; ok: true; result: ResultByType[keyof ResultByType] }
  | { id: number; ok: false; error: string };

/** A request without its id, as callers write it before the client assigns one. */
export type SpellCommand = SpellRequest extends infer R ? (R extends SpellRequest ? Omit<R, 'id'> : never) : never;
