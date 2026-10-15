import { useCallback, useState } from "react";
import { EventLog } from "./components/EventLog";
import { MessageField } from "./components/MessageField";
import { SettingsPanel } from "./components/SettingsPanel";
import { useEventLog } from "./hooks/useEventLog";
import { useSettings } from "./hooks/useSettings";
import { DEFAULT_SETTINGS, lines } from "./lib/settings";

export function App() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [appliedSettings, setAppliedSettings] = useState(settings);
  const [hasUnappliedEdits, setHasUnappliedEdits] = useState(false);
  const { logEntries, logEvent, clearLog } = useEventLog();

  const changeIgnoredWords = useCallback((ignoredWords: string) => updateSettings({ ignoredWords }), [updateSettings]);

  const addToDictionary = useCallback(
    (word: string) =>
      updateSettings((current) => ({
        customDictionary: [...lines(current.customDictionary), word].join("\n"),
      })),
    [updateSettings],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        Auto-complete and auto-correct
      </h1>
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <SettingsPanel
          settings={settings}
          onUpdate={(patch) => {
            updateSettings(patch);
            setHasUnappliedEdits(true);
          }}
          onReset={() => {
            resetSettings();
            setAppliedSettings(DEFAULT_SETTINGS);
            setHasUnappliedEdits(false);
          }}
          canApply={hasUnappliedEdits}
          onApply={() => {
            setAppliedSettings(settings);
            setHasUnappliedEdits(false);
          }}
        />
        <main className="space-y-4">
          <MessageField
            settings={appliedSettings}
            onLog={logEvent}
            onAddToDictionary={addToDictionary}
            onIgnoredWordsChange={changeIgnoredWords}
          />
          <EventLog entries={logEntries} onClear={clearLog} />
        </main>
      </div>
    </div>
  );
}
