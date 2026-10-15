import { useCallback, useState } from 'react';
import type { AssistEvent } from '../../assistant';

const MAX_LINES = 300;

export function useEventLog() {
  const [logLines, setLogLines] = useState<string[]>([]);
  const logEvent = useCallback((event: AssistEvent) => {
    const line = `${new Date().toISOString().slice(11, 23)} ${JSON.stringify(event)}`;
    setLogLines((lines) => [...lines.slice(-(MAX_LINES - 1)), line]);
  }, []);
  const clearLog = useCallback(() => setLogLines([]), []);
  return { logLines, logEvent, clearLog };
}
