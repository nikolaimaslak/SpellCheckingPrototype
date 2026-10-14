import { useCallback, useState } from 'react';
import { appendEntry, type LogEntry, type LogEvent } from '../lib/event-log';

export function useEventLog() {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logEvent = useCallback((event: LogEvent) => setLogEntries((list) => appendEntry(list, event)), []);
  const clearLog = useCallback(() => setLogEntries([]), []);
  return { logEntries, logEvent, clearLog };
}
