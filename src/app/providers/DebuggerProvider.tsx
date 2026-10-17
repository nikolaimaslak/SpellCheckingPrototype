import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AssistantEvent } from '../../assistant';

const MAX_EVENTS = 300;

export interface DebuggerEvent {
  id: number;
  time: string;
  event: AssistantEvent;
}

export interface DebuggerContextValue {
  debuggerEvents: DebuggerEvent[];
  onEvent: (event: AssistantEvent) => void;
  clearDebugger: () => void;
}

const DebuggerContext = createContext<DebuggerContextValue | null>(null);

export function useDebugger(): DebuggerContextValue {
  const value = useContext(DebuggerContext);
  if (!value) {
    throw new Error('useDebugger is used outside DebuggerProvider');
  }
  return value;
}

export function DebuggerProvider({ children }: { children: ReactNode }) {
  const [debuggerEvents, setDebuggerEvents] = useState<DebuggerEvent[]>([]);
  const nextId = useRef(0);
  const onEvent = useCallback((event: AssistantEvent) => {
    const debuggerEvent: DebuggerEvent = {
      id: nextId.current++,
      time: new Date().toISOString().slice(11, 23),
      event,
    };
    setDebuggerEvents((current) => [...current.slice(-(MAX_EVENTS - 1)), debuggerEvent]);
  }, []);
  const clearDebugger = useCallback(() => setDebuggerEvents([]), []);
  const value = useMemo(() => {
    const debuggerContextValue: DebuggerContextValue = {
      debuggerEvents,
      onEvent,
      clearDebugger,
    };
    return debuggerContextValue;
  }, [debuggerEvents, onEvent, clearDebugger]);

  return <DebuggerContext.Provider value={value}>{children}</DebuggerContext.Provider>;
}
