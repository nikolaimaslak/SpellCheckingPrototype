import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createAssistant, INITIAL_STATE, type Assistant, type AssistantOptions, type AssistantEvent } from '../../assistant';
import { isMac } from '../lib/browser';
import { createContentEditableEditorControl } from '../lib/content-editable-editor-control';
import { createOpenAILLMClient } from '../lib/openai-llm-client';
import { lines, type AppSettings } from '../lib/settings';

const DEBOUNCE_MS = 1000;

const noSubscription = () => () => {};
const initialState = () => INITIAL_STATE;

export function useAssistant(
  fieldRef: RefObject<HTMLElement | null>,
  settings: AppSettings,
  onEvent: (event: AssistantEvent) => void,
  onIgnoredWordsChange: (text: string) => void,
  onCustomDictionaryChange: (text: string) => void,
) {
  const options = useMemo(() => {
    const assistantOptions: AssistantOptions = {
      spellCheckMode: !settings.withSpellCheck
        ? 'off'
        : settings.withAutoCorrect
          ? 'auto-correct'
          : 'underline',
      customDictionary: lines(settings.customDictionary),
      ignoredWords: lines(settings.ignoredWords),
      onIgnoredWordsChange: (words) => onIgnoredWordsChange(words.join('\n')),
      onCustomDictionaryChange: (words) => onCustomDictionaryChange(words.join('\n')),
      withAutoCompletion: settings.withAutoCompletion,
      isMac,
      debounceMs: DEBOUNCE_MS,
      llmClient: createOpenAILLMClient(settings.apiKey),
      llmContext: settings.llmContext,
      onEvent,
    };
    return assistantOptions;
  }, [settings, onEvent, onIgnoredWordsChange, onCustomDictionaryChange]);

  const [assistant, setAssistant] = useState<Assistant>();
  const appliedOptions = useRef(options);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const created = createAssistant(createContentEditableEditorControl(field), options);
    appliedOptions.current = options;
    setAssistant(created);
    return () => {
      created.release();
      setAssistant(undefined);
    };
  }, [fieldRef]);

  useEffect(() => {
    if (!assistant || appliedOptions.current === options) {
      return;
    }
    appliedOptions.current = options;
    assistant.updateOptions(options);
  }, [assistant, options]);

  const state = useSyncExternalStore(assistant?.subscribe ?? noSubscription, assistant?.getState ?? initialState);
  return { assistant, state };
}
