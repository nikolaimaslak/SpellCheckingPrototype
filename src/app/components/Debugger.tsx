import { useEffect, useRef, useState } from 'react';
import type { AssistantEvent, DebugArea } from '../../assistant';
import { useDebugger } from '../providers/DebuggerProvider';
import { DebuggerEventText } from './DebuggerEventText';

const AREA_COLORS: Record<DebugArea, string> = {
  assistant: 'text-slate-300',
  typing: 'text-sky-300',
  llm: 'text-violet-300',
  'spell-check': 'text-rose-300',
  'auto-correct': 'text-amber-300',
  'auto-completion': 'text-emerald-300',
};

function describe(event: AssistantEvent): string {
  const details = event.details === undefined ? '' : ` ${JSON.stringify(event.details)}`;
  return `[${event.area}] ${event.message}${details}`;
}

export function Debugger() {
  const { debuggerEvents, clearDebugger } = useDebugger();
  const pre = useRef<HTMLPreElement>(null);
  const scrollToEnd = () => {
    if (pre.current) {
      pre.current.scrollTop = pre.current.scrollHeight;
    }
  };
  useEffect(scrollToEnd, [debuggerEvents]);

  const [isCopied, setIsCopied] = useState(false);
  const copyAll = async () => {
    await navigator.clipboard.writeText(debuggerEvents.map((debuggerEvent) => `${debuggerEvent.time} ${describe(debuggerEvent.event)}`).join('\n'));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <details className="group space-y-1" onToggle={scrollToEnd}>
      <summary className="cursor-pointer list-none">
        <h2 className="text-sm font-semibold">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Debugger
          <span className="ml-1 font-normal text-slate-500">({debuggerEvents.length})</span>
        </h2>
      </summary>
      <div className="relative">
        <pre ref={pre} className="h-64 min-h-16 resize-y space-y-1.5 overflow-auto rounded bg-slate-900 p-2 pr-36 text-xs leading-5 whitespace-pre-wrap break-all">
          {debuggerEvents.length ? (
            debuggerEvents.map((debuggerEvent) => (
              <div key={debuggerEvent.id} className={AREA_COLORS[debuggerEvent.event.area]}>
                <span className="text-slate-500">{debuggerEvent.time}</span> <DebuggerEventText text={describe(debuggerEvent.event)} />
              </div>
            ))
          ) : (
            <div className="text-slate-500">Debugger events will show up here</div>
          )}
        </pre>
        {!!debuggerEvents.length && (
          <div className="absolute top-2 right-5 flex gap-1.5 [&_button]:rounded [&_button]:bg-slate-700 [&_button]:px-2 [&_button]:py-0.5 [&_button]:text-xs [&_button]:text-slate-200 [&_button:hover]:bg-slate-600">
            <button type="button" onClick={copyAll}>
              {isCopied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={clearDebugger}>
              Clear
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
