import type { AutoReplaceConfidence } from '../../autocorrect/confidence';
import { SCENARIOS } from '../../demo/scenarios';
import type { Lang } from '../../spell/protocol';
import { DEFAULT_CANNED, DEFAULT_KB } from './default-sources';

/** Everything the React demo lets you change. Text fields keep the raw text; `lines()` splits it. */
export interface AppSettings {
  spellCheck: boolean;
  /** Only with spellCheck on. */
  autoCorrect: boolean;
  autoReplace: AutoReplaceConfidence;
  languages: Lang[];
  /** One word per line: never flagged, never auto-corrected. */
  customDictionary: string;
  completion: boolean;
  /** `Customer:` / `Agent:` lines: auto-correct protection, canned/KB search and LLM context. */
  conversation: string;
  /** One canned response per line; empty = no canned responses. */
  canned: string;
  /** One "Title: body" article per line; empty = no knowledge base. */
  kb: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  spellCheck: true,
  autoCorrect: true,
  autoReplace: 'list-and-rule',
  languages: ['en', 'ar'],
  customDictionary: ['GOSI', 'Absher', 'Musaned'].join('\n'),
  completion: true,
  conversation: `Customer: ${SCENARIOS['en-pension'][0]}`,
  canned: DEFAULT_CANNED,
  kb: DEFAULT_KB,
};

const KEY = 'bp-spell-react-demo-settings';
const LANGS: Lang[] = ['en', 'ar'];

export const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

/** The composer library's mode from the two checkboxes. */
export const spellMode = (settings: Pick<AppSettings, 'spellCheck' | 'autoCorrect'>): 'off' | 'suggest' | 'auto' =>
  !settings.spellCheck ? 'off' : settings.autoCorrect ? 'auto' : 'suggest';

/** Stored settings over the defaults, field by field; anything malformed falls back to its default. */
export function parseSettings(input: unknown): AppSettings {
  const stored = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const booleanField = (key: keyof AppSettings) =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
  const textField = (key: keyof AppSettings) => (typeof stored[key] === 'string' ? (stored[key] as string) : (DEFAULT_SETTINGS[key] as string));
  return {
    spellCheck: booleanField('spellCheck'),
    autoCorrect: booleanField('autoCorrect'),
    autoReplace: stored.autoReplace === 'list' || stored.autoReplace === 'list-and-rule' ? stored.autoReplace : DEFAULT_SETTINGS.autoReplace,
    languages: Array.isArray(stored.languages) ? LANGS.filter((lang) => (stored.languages as unknown[]).includes(lang)) : [...DEFAULT_SETTINGS.languages],
    customDictionary: textField('customDictionary'),
    completion: booleanField('completion'),
    conversation: textField('conversation'),
    canned: textField('canned'),
    kb: textField('kb'),
  };
}

// Storage can be missing or throw (private mode, blocked site data): never fail, just don't persist.
export function loadSettings(storage: Storage | undefined = safeStorage()): AppSettings {
  try {
    return parseSettings(JSON.parse(storage?.getItem(KEY) ?? 'null'));
  } catch {
    return parseSettings(null);
  }
}

export function saveSettings(settings: AppSettings, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // not persisted
  }
}

export function clearSettings(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
