import { useState } from 'react';

const MAX_COLLAPSED_LENGTH = 200;

export function DebuggerEventText({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (text.length <= MAX_COLLAPSED_LENGTH) {
    return text;
  }
  return (
    <>
      {isExpanded ? text : `${text.slice(0, MAX_COLLAPSED_LENGTH)}…`}{' '}
      <button type="button" className="cursor-pointer text-slate-400 underline hover:text-slate-200" onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? 'collapse' : `show all ${text.length} characters`}
      </button>
    </>
  );
}
