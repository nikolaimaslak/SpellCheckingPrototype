import type { AssistantOptions, AssistEvent } from '../../assistant';
import type { Turn } from '../../assistant/types';
import { CONVERSATION_PRESETS } from './conversation';
import { DEFAULT_CANNED, DEFAULT_KB } from './default-sources';

/** Everything the React demo lets you change. Text fields keep the raw text; `lines()` splits it. */
export interface AppSettings {
  spellCheck: boolean;
  /** Only with spellCheck on. */
  autoCorrect: boolean;
  /** One word per line: never flagged, never auto-corrected. */
  customDictionary: string;
  completion: boolean;
  debounceMs: number;
  /** OpenAI key for spelling, completion and polish; empty = all three are off. */
  apiKey: string;
  /** `Customer:` / `Agent:` lines: auto-correct protection and LLM context. */
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
  completion: true,
  debounceMs: 1000,
  apiKey: '',
  conversation: CONVERSATION_PRESETS.English,
  canned: DEFAULT_CANNED,
  kb: DEFAULT_KB,
};

const KEY = 'bp-spell-react-demo-settings';

export const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

/** The assistant's mode from the two checkboxes. */
export const spellMode = (settings: Pick<AppSettings, 'spellCheck' | 'autoCorrect'>): 'off' | 'suggest' | 'auto' =>
  !settings.spellCheck ? 'off' : settings.autoCorrect ? 'auto' : 'suggest';

/** The assistant's options from the settings. The conversation is read live, so it isn't part of them. */
export function assistantOptions(
  settings: Omit<AppSettings, 'conversation'>,
  conversation: () => Turn[],
  log: (event: AssistEvent) => void,
): AssistantOptions {
  return {
    spelling: spellMode(settings),
    customWords: lines(settings.customDictionary),
    completion: settings.completion,
    debounceMs: settings.debounceMs,
    apiKey: settings.apiKey,
    canned: lines(settings.canned),
    kb: lines(settings.kb),
    conversation,
    log,
  };
}

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
    completion: booleanField('completion'),
    debounceMs: typeof stored.debounceMs === 'number' && stored.debounceMs >= 0 ? stored.debounceMs : DEFAULT_SETTINGS.debounceMs,
    apiKey: textField('apiKey'),
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
