import { useEffect, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import { createAssistant, type Assistant, type AssistantOptions, type AssistEvent } from '../../assistant';
import { INITIAL_STATE } from '../../assistant/types';
import { lines, type AppSettings } from '../lib/settings';

const DEBOUNCE_MS = 1000;

const noSubscription = () => () => {};
const initialState = () => INITIAL_STATE;

export function useAssistant(
  fieldRef: RefObject<HTMLElement | null>,
  settings: AppSettings,
  onLog: (event: AssistEvent) => void,
  onIgnoredWordsChange: (text: string) => void,
) {
  const options = useMemo(() => {
    const assistantOptions: AssistantOptions = {
      spellCheckMode: !settings.withSpellCheck ? 'off' : settings.withAutoCorrect ? 'auto-correct' : 'underline',
      customWords: lines(settings.customDictionary),
      ignoredWords: lines(settings.ignoredWords),
      onIgnoredWordsChange: (words) => onIgnoredWordsChange(words.join('\n')),
      withCompletion: settings.withCompletion,
      debounceMs: DEBOUNCE_MS,
      apiKey: settings.apiKey,
      llmContext: settings.llmContext,
      log: onLog,
    };
    return assistantOptions;
  }, [settings, onLog, onIgnoredWordsChange]);

  const [assistant, setAssistant] = useState<Assistant>();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const created = createAssistant(field, options);
    setAssistant(created);
    return () => {
      created.release();
      setAssistant(undefined);
    };
  }, [fieldRef]);

  useEffect(() => {
    assistant?.updateOptions(options);
  }, [assistant, options]);

  const state = useSyncExternalStore(assistant?.subscribe ?? noSubscription, assistant?.getState ?? initialState);
  return { assistant, state };
}
