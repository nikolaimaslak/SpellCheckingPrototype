import { useCallback, useEffect, useState } from "react";
import { ApiKeyField } from "./components/ApiKeyField";
import { Checkbox } from "./components/Checkbox";
import { EventLog } from "./components/EventLog";
import { LLMContextField } from "./components/LLMContextField";
import { MessageField } from "./components/MessageField";
import { TextArea } from "./components/TextArea";
import { useEventLog } from "./hooks/useEventLog";
import { DEFAULT_SETTINGS, lines, type AppSettings } from "./lib/settings";

const APPLY_SETTINGS_DEBOUNCE_MS = 500;

export function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [appliedSettings, setAppliedSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const { logLines, logEvent, clearLog } = useEventLog();

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSettings(settings), APPLY_SETTINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [settings]);

  const updateSettings = (patch: Partial<AppSettings>) => setSettings((current) => ({ ...current, ...patch }));

  const changeIgnoredWords = useCallback((ignoredWords: string) => setSettings((current) => ({ ...current, ignoredWords })), []);

  const addToDictionary = useCallback(
    (word: string) =>
      setSettings((current) => ({
        ...current,
        customDictionary: [...lines(current.customDictionary), word].join("\n"),
      })),
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">
          Auto-complete and auto-correct
        </h1>
        <ApiKeyField value={settings.apiKey} onChange={(apiKey) => updateSettings({ apiKey })} />
      </header>
      <main className="space-y-4">
        <div className="flex flex-col gap-3 lg:grid lg:h-48 lg:resize-y lg:grid-cols-[minmax(0,1fr)_9rem_9rem] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-x-3 lg:gap-y-1 lg:overflow-hidden">
          <LLMContextField value={settings.llmContext} onChange={(llmContext) => updateSettings({ llmContext })} />
          <TextArea
            label="Custom dictionary"
            hint="Never underlined."
            value={settings.customDictionary}
            onChange={(customDictionary) => updateSettings({ customDictionary })}
          />
          <TextArea
            label="Ignored words"
            hint="Never auto-corrected."
            value={settings.ignoredWords}
            onChange={(ignoredWords) => updateSettings({ ignoredWords })}
          />
        </div>
        <MessageField
          settings={appliedSettings}
          toolbar={
            <>
              <Checkbox label="Spell check" checked={settings.spellCheck} disabled={!settings.apiKey} onChange={(spellCheck) => updateSettings({ spellCheck })} />
              <Checkbox
                label="Auto-correct"
                checked={settings.autoCorrect}
                disabled={!settings.apiKey || !settings.spellCheck}
                onChange={(autoCorrect) => updateSettings({ autoCorrect })}
              />
              <Checkbox label="Completion" checked={settings.completion} disabled={!settings.apiKey} onChange={(completion) => updateSettings({ completion })} />
            </>
          }
          onLog={logEvent}
          onAddToDictionary={addToDictionary}
          onIgnoredWordsChange={changeIgnoredWords}
        />
        <EventLog lines={logLines} onClear={clearLog} />
      </main>
    </div>
  );
}
