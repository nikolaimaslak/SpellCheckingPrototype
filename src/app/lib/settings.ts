import { CONTEXT_PRESETS } from './context-presets';

export interface AppSettings {
  withSpellCheck: boolean;
  withAutoCorrect: boolean;
  customDictionary: string;
  ignoredWords: string;
  withAutoCompletion: boolean;
  apiKey: string;
  llmContext: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  withSpellCheck: true,
  withAutoCorrect: true,
  customDictionary: ['GOSI', 'Absher', 'Musaned'].join('\n'),
  ignoredWords: '',
  withAutoCompletion: true,
  apiKey: '',
  llmContext: CONTEXT_PRESETS.English,
};

export const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
