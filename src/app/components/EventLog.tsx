import { useEffect, useRef } from 'react';

export function EventLog({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [lines]);

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Debugger</h2>
        <button type="button" className="text-xs text-slate-500 hover:underline" onClick={onClear}>
          Clear
        </button>
      </div>
      <pre ref={pre} className="h-64 min-h-16 resize-y overflow-auto rounded bg-slate-900 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-green-200">
        {lines.join('\n')}
      </pre>
    </section>
  );
}
