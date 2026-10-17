import { useCallback, useRef, useState } from 'react';
import type { AssistantEvent } from '../../assistant';

const MAX_EVENTS = 300;

export interface DebuggerEvent {
  id: number;
  time: string;
  event: AssistantEvent;
}

export function useDebugger() {
  const [debuggerEvents, setDebuggerEvents] = useState<DebuggerEvent[]>([]);
  const nextId = useRef(0);
  const onEvent = useCallback((event: AssistantEvent) => {
    const debuggerEvent: DebuggerEvent = {
      id: nextId.current++,
      time: new Date().toISOString().slice(11, 23),
      event,
    };
    setDebuggerEvents((debuggerEvents) => [...debuggerEvents.slice(-(MAX_EVENTS - 1)), debuggerEvent]);
  }, []);
  const clearDebugger = useCallback(() => setDebuggerEvents([]), []);
  return {
    debuggerEvents,
    onEvent,
    clearDebugger,
  };
}
