import { CONTEXT_PRESETS } from './context-presets';

/** Everything the React demo lets you change. Text fields keep the raw text; `lines()` splits it. */
export interface AppSettings {
  spellCheck: boolean;
  /** Only with spellCheck on. */
  autoCorrect: boolean;
  /** One word per line: never flagged, never auto-corrected. */
  customDictionary: string;
  ignoredWords: string;
  completion: boolean;
  debounceMs: number;
  /** OpenAI key for spelling, completion and polish; empty = all three are off. */
  apiKey: string;
  /** `Customer:` / `Agent:` lines, sent to the LLM as context. */
  conversation: string;
  /** One canned response per line; empty = no canned responses. */
  canned: string;
  /** One "Title: body" article per line; empty = no knowledge base. */
  kb: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  spellCheck: true,
  autoCorrect: true,
  customDictionary: ['GOSI', 'Absher', 'Musaned'].join('\n'),
  ignoredWords: '',
  completion: true,
  debounceMs: 1000,
  apiKey: '',
  ...CONTEXT_PRESETS.English,
};

const KEY = 'bp-spell-react-demo-settings';

export const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

/** Stored settings over the defaults, field by field; anything malformed falls back to its default. */
export function parseSettings(input: unknown): AppSettings {
  const stored = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const booleanField = (key: keyof AppSettings) =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
  const textField = (key: keyof AppSettings) => (typeof stored[key] === 'string' ? (stored[key] as string) : (DEFAULT_SETTINGS[key] as string));
  return {
    spellCheck: booleanField('spellCheck'),
    autoCorrect: booleanField('autoCorrect'),
    customDictionary: textField('customDictionary'),
    ignoredWords: textField('ignoredWords'),
    completion: booleanField('completion'),
    debounceMs: typeof stored.debounceMs === 'number' && stored.debounceMs >= 0 ? stored.debounceMs : DEFAULT_SETTINGS.debounceMs,
    apiKey: '',
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
    storage?.setItem(KEY, JSON.stringify({ ...settings, apiKey: '' }));
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
