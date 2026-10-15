import { useCallback } from "react";
import { EventLog } from "./components/EventLog";
import { MessageField } from "./components/MessageField";
import { SettingsPanel } from "./components/SettingsPanel";
import { useDebounced } from "./hooks/useDebounced";
import { useEventLog } from "./hooks/useEventLog";
import { useSettings } from "./hooks/useSettings";
import { lines } from "./lib/settings";

export function App() {
  const { settings, updateSettings, resetSettings } = useSettings();
  // Typing in a text field shouldn't re-attach on every key.
  const appliedSettings = useDebounced(settings, 400);
  const { logEntries, logEvent, clearLog } = useEventLog();


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
          onUpdate={updateSettings}
          onReset={resetSettings}
        />
        <main className="space-y-4">
          <MessageField
            settings={appliedSettings}
            onLog={logEvent}
            onAddToDictionary={addToDictionary}
          />
          <EventLog entries={logEntries} onClear={clearLog} />
        </main>
      </div>
    </div>
  );
}
