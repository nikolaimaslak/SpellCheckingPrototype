import { useEffect, useRef } from 'react';

export function EventLog({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const scrollToEnd = () => {
    if (pre.current) {
      pre.current.scrollTop = pre.current.scrollHeight;
    }
  };
  useEffect(scrollToEnd, [lines]);

  return (
    <details className="group space-y-1" onToggle={scrollToEnd}>
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <h2 className="text-sm font-semibold">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Debugger
          <span className="ml-1 font-normal text-slate-500">({lines.length})</span>
        </h2>
        <button
          type="button"
          className="text-xs text-slate-500 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            onClear();
          }}
        >
          Clear
        </button>
      </summary>
      <pre ref={pre} className="h-64 min-h-16 resize-y overflow-auto rounded bg-slate-900 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-green-200">
        {lines.join('\n')}
      </pre>
    </details>
  );
}
