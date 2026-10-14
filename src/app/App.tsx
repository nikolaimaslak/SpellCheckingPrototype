import { useCallback, useMemo, useRef } from 'react';
import { EventLog } from './components/EventLog';
import { MessageField } from './components/MessageField';
import { SettingsPanel } from './components/SettingsPanel';
import { useAssist } from './hooks/useAssist';
import { useDebounced } from './hooks/useDebounced';
import { useEventLog } from './hooks/useEventLog';
import { useSettings } from './hooks/useSettings';
import { useSpellService } from './hooks/useSpellService';
import type { AssistContext, AssistSettings } from './lib/assist';
import { appendTurn, parseConversation } from './lib/conversation';
import { lines } from './lib/settings';

export function App() {
  const { settings, updateSettings, resetSettings } = useSettings();
  // Typing in a text field shouldn't restart the worker or re-attach on every key.
  const appliedSettings = useDebounced(settings, 400);
  const { spellService, spellStatus } = useSpellService(appliedSettings.languages, lines(appliedSettings.customDictionary));
  const { logEntries, logEvent, clearLog } = useEventLog();

  // The conversation is read live on every use, so editing it never re-attaches (which would forget ignored words).
  const conversationRef = useRef(settings.conversation);
  conversationRef.current = settings.conversation;
  const addAgentMessage = useCallback(
    (text: string) => updateSettings((current) => ({ conversation: appendTurn(current.conversation, { role: 'agent', text }) })),
    [updateSettings],
  );
  const assistContext = useMemo<AssistContext>(
    () => ({ conversation: () => parseConversation(conversationRef.current), log: logEvent }),
    [logEvent],
  );

  const { conversation: _conversation, ...appliedAssistSettings } = appliedSettings;
  const assistSettingsKey = JSON.stringify(appliedAssistSettings);
  const assistSettings = useMemo(() => JSON.parse(assistSettingsKey) as AssistSettings, [assistSettingsKey]);

  const messageFieldRef = useRef<HTMLDivElement>(null);
  useAssist(messageFieldRef, assistSettings, spellService, assistContext);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <SettingsPanel settings={settings} spellStatus={spellStatus} onUpdate={updateSettings} onReset={resetSettings} />
      <main className="space-y-4">
        <h1 className="text-xl font-semibold">Composer assistance (React demo)</h1>
        <MessageField ref={messageFieldRef} onSend={addAgentMessage} />
        <EventLog entries={logEntries} onClear={clearLog} />
      </main>
    </div>
  );
}
