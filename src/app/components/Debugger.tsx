import { useEffect, useRef } from 'react';
import type { AssistantEvent, DebugArea } from '../../assistant';
import type { DebuggerEvent } from '../hooks/useDebugger';
import { DebuggerEventText } from './DebuggerEventText';

const AREA_COLORS: Record<DebugArea, string> = {
  assistant: 'text-slate-300',
  typing: 'text-sky-300',
  llm: 'text-violet-300',
  'spell-check': 'text-rose-300',
  'auto-correct': 'text-amber-300',
  'auto-completion': 'text-emerald-300',
};

function areaOf(event: AssistantEvent): DebugArea {
  if (event.type === 'debug') {
    return event.area;
  }
  if (event.type.startsWith('auto-correct')) {
    return 'auto-correct';
  }
  if (event.type.startsWith('auto-completion')) {
    return 'auto-completion';
  }
  return 'spell-check';
}

function describe(event: AssistantEvent): string {
  if (event.type !== 'debug') {
    return JSON.stringify(event);
  }
  const details = event.details === undefined ? '' : ` ${JSON.stringify(event.details)}`;
  return `[${event.area}] ${event.message}${details}`;
}

export function Debugger({ debuggerEvents, onClear }: { debuggerEvents: DebuggerEvent[]; onClear: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const scrollToEnd = () => {
    if (pre.current) {
      pre.current.scrollTop = pre.current.scrollHeight;
    }
  };
  useEffect(scrollToEnd, [debuggerEvents]);

  return (
    <details className="group space-y-1" onToggle={scrollToEnd}>
      <summary className="cursor-pointer list-none">
        <h2 className="text-sm font-semibold">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Debugger
          <span className="ml-1 font-normal text-slate-500">({debuggerEvents.length})</span>
        </h2>
      </summary>
      <div className="relative">
        <pre ref={pre} className="h-64 min-h-16 resize-y space-y-1.5 overflow-auto rounded bg-slate-900 p-2 pr-16 text-xs leading-5 whitespace-pre-wrap break-all">
          {debuggerEvents.length ? (
            debuggerEvents.map((debuggerEvent) => (
              <div key={debuggerEvent.id} className={`${AREA_COLORS[areaOf(debuggerEvent.event)]} ${debuggerEvent.event.type === 'debug' ? '' : 'font-bold'}`}>
                <span className="text-slate-500">{debuggerEvent.time}</span> <DebuggerEventText text={describe(debuggerEvent.event)} />
              </div>
            ))
          ) : (
            <div className="text-slate-500">Debugger events will show up here</div>
          )}
        </pre>
        {!!debuggerEvents.length && (
          <button type="button" className="absolute top-2 right-5 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-600" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </details>
  );
}
