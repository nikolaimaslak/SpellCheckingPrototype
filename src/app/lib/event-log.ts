import type { AssistEvent } from '../../assistant';

/** One line of the on-page event console. */
export interface LogEntry {
  id: number;
  time: string;
  event: AssistEvent;
}

const MAX_ENTRIES = 300;
let nextId = 0;

/** Appends an event, newest last, keeping the last MAX_ENTRIES. */
export function appendEntry(entries: LogEntry[], event: AssistEvent): LogEntry[] {
  const entry: LogEntry = { id: nextId++, time: new Date().toISOString().slice(11, 23), event };
  return [...entries.slice(-(MAX_ENTRIES - 1)), entry];
}

export const formatEntry = (e: LogEntry) => `${e.time} ${JSON.stringify(e.event)}`;
