import { useCallback, useEffect, useState } from "react";
import { EventLog } from "./components/EventLog";
import { LLMContextField } from "./components/LLMContextField";
import { MessageField } from "./components/MessageField";
import { SettingsPanel } from "./components/SettingsPanel";
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
      <h1 className="text-xl font-semibold">
        Auto-complete and auto-correct
      </h1>
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <SettingsPanel settings={settings} onUpdate={updateSettings} />
        <main className="space-y-4">
          <div className="flex flex-col gap-3 md:h-64 md:resize-y md:flex-row md:overflow-hidden">
            <LLMContextField value={settings.llmContext} onChange={(llmContext) => updateSettings({ llmContext })} />
            <div className="flex md:w-36">
              <TextArea
                label="Custom dictionary"
                hint="Never underlined."
                value={settings.customDictionary}
                onChange={(customDictionary) => updateSettings({ customDictionary })}
              />
            </div>
            <div className="flex md:w-36">
              <TextArea
                label="Ignored words"
                hint="Never auto-corrected."
                value={settings.ignoredWords}
                onChange={(ignoredWords) => updateSettings({ ignoredWords })}
              />
            </div>
          </div>
          <MessageField
            settings={appliedSettings}
            onLog={logEvent}
            onAddToDictionary={addToDictionary}
            onIgnoredWordsChange={changeIgnoredWords}
          />
          <EventLog lines={logLines} onClear={clearLog} />
        </main>
      </div>
    </div>
  );
}
