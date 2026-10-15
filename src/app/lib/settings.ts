import { CONTEXT_PRESETS } from './context-presets';

export interface AppSettings {
  spellCheck: boolean;
  autoCorrect: boolean;
  customDictionary: string;
  ignoredWords: string;
  completion: boolean;
  debounceMs: number;
  apiKey: string;
  conversation: string;
  canned: string;
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

export function loadSettings(): AppSettings {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(KEY) ?? '{}'),
      apiKey: ''
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...settings, apiKey: '' }));
  } catch {
    return;
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    return;
  }
}
