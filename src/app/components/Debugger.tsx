import { useEffect, useRef } from 'react';

export function Debugger({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const scrollToEnd = () => {
    if (pre.current) {
      pre.current.scrollTop = pre.current.scrollHeight;
    }
  };
  useEffect(scrollToEnd, [lines]);

  return (
    <details className="group space-y-1" onToggle={scrollToEnd}>
      <summary className="cursor-pointer list-none">
        <h2 className="text-sm font-semibold">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Debugger
          <span className="ml-1 font-normal text-slate-500">({lines.length})</span>
        </h2>
      </summary>
      <div className="relative">
        <pre ref={pre} className="h-64 min-h-16 resize-y space-y-1.5 overflow-auto rounded bg-slate-900 p-2 pr-16 text-xs leading-5 whitespace-pre-wrap break-all text-green-200">
          {lines.length ? (
            lines.map((line, i) => <div key={i}>{line}</div>)
          ) : (
            <div className="text-slate-500">Debugger events will show up here</div>
          )}
        </pre>
        {!!lines.length && (
          <button type="button" className="absolute top-2 right-5 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-600" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </details>
  );
}
