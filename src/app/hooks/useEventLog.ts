import { useCallback, useState } from 'react';
import type { AssistEvent } from '../../assistant';
import { appendEntry, type LogEntry } from '../lib/event-log';

export function useEventLog() {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logEvent = useCallback((event: AssistEvent) => setLogEntries((list) => appendEntry(list, event)), []);
  const clearLog = useCallback(() => setLogEntries([]), []);
  return { logEntries, logEvent, clearLog };
}
