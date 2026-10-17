import { CONTEXT_PRESETS } from './context-presets';

export interface AppSettings {
  withSpellCheck: boolean;
  withAutoCorrection: boolean;
  customDictionary: string;
  ignoredWords: string;
  withAutoCompletion: boolean;
  apiKey: string;
  llmContext: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  withSpellCheck: true,
  withAutoCorrection: true,
  customDictionary: ['GOSI', 'Absher', 'Musaned'].join('\n'),
  ignoredWords: '',
  withAutoCompletion: true,
  apiKey: '',
  llmContext: CONTEXT_PRESETS.English,
};

export const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
