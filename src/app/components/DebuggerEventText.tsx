const MAX_COLLAPSED_LENGTH = 200;

export function DebuggerEventText({ text }: { text: string }) {
  if (text.length <= MAX_COLLAPSED_LENGTH) {
    return text;
  }
  return (
    <details className="group/debuggerEvent inline">
      <summary className="inline cursor-pointer list-none">
        <span className="group-open/debuggerEvent:hidden">
          {text.slice(0, MAX_COLLAPSED_LENGTH)}
          <span className="text-slate-400 underline">… show all {text.length} characters</span>
        </span>
        <span className="hidden group-open/debuggerEvent:inline">{text}</span>
      </summary>
    </details>
  );
}
