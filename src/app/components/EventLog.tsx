import { useEffect, useRef } from 'react';
import { formatEntry, type LogEntry } from '../lib/event-log';

/** On-page console: every event as one JSON line, newest at the bottom. */
export function EventLog({ entries, onClear }: { entries: LogEntry[]; onClear: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [entries]);

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Events</h2>
        <button type="button" className="text-xs text-slate-500 hover:underline" onClick={onClear}>
          Clear
        </button>
      </div>
      <pre ref={pre} className="h-64 overflow-auto rounded bg-slate-900 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-green-200">
        {entries.map(formatEntry).join('\n')}
      </pre>
    </section>
  );
}
