import { useCallback, useRef } from "react";
import { EventLog } from "./components/EventLog";
import { MessageField } from "./components/MessageField";
import { SettingsPanel } from "./components/SettingsPanel";
import { useDebounced } from "./hooks/useDebounced";
import { useEventLog } from "./hooks/useEventLog";
import { useSettings } from "./hooks/useSettings";
import { appendTurn, parseConversation } from "./lib/conversation";
import { lines } from "./lib/settings";

export function App() {
  const { settings, updateSettings, resetSettings } = useSettings();
  // Typing in a text field shouldn't re-attach on every key.
  const appliedSettings = useDebounced(settings, 400);
  const { logEntries, logEvent, clearLog } = useEventLog();

  // The conversation is read live on every use, so editing it never re-attaches (which would forget ignored words).
  const conversationRef = useRef(settings.conversation);
  conversationRef.current = settings.conversation;
  const readConversation = useCallback(
    () => parseConversation(conversationRef.current),
    [],
  );
  const addAgentMessage = useCallback(
    (text: string) =>
      updateSettings((current) => ({
        conversation: appendTurn(current.conversation, { role: "agent", text }),
      })),
    [updateSettings],
  );

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
            readConversation={readConversation}
            onLog={logEvent}
            onSend={addAgentMessage}
            onAddToDictionary={addToDictionary}
          />
          <EventLog entries={logEntries} onClear={clearLog} />
        </main>
      </div>
    </div>
  );
}
