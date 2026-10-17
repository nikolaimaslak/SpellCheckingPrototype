import { useCallback, useState } from 'react';
import type { AssistantEvent } from '../../assistant';

const MAX_LINES = 300;

export function useDebugger() {
  const [debuggerLines, setDebuggerLines] = useState<string[]>([]);
  const onEvent = useCallback((event: AssistantEvent) => {
    const line = `${new Date().toISOString().slice(11, 23)} ${JSON.stringify(event)}`;
    setDebuggerLines((lines) => [...lines.slice(-(MAX_LINES - 1)), line]);
  }, []);
  const clearDebugger = useCallback(() => setDebuggerLines([]), []);
  return {
    debuggerLines,
    onEvent,
    clearDebugger,
  };
}
