import type { KeyboardEvent, RefObject } from 'react';

interface Props {
  composerRef: RefObject<HTMLDivElement | null>;
  /** Adds the sent message to the Conversation field. */
  onAgentMessage: (text: string) => void;
}

export function Chat({ composerRef, onAgentMessage }: Props) {
  return (
    <section className="space-y-2">
      <Composer ref={composerRef} onSend={onAgentMessage} />
      <p className="text-xs text-slate-500">
        Enter adds the message to Conversation as Agent, Shift+Enter breaks the line. Click an underlined word (or Ctrl+.) for suggestions. Tab accepts the grey suggestion. Ctrl/Cmd+Z undoes any automatic change.
      </p>
    </section>
  );
}

/**
 * The agent's composer. Its content is owned by the browser and the composer
 * library, never rendered by React: it has no children here.
 */
function Composer({ ref, onSend }: { ref: RefObject<HTMLDivElement | null>; onSend: (text: string) => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.defaultPrevented) return;
    e.preventDefault();
    const text = e.currentTarget.innerText.trim();
    if (!text) return;
    onSend(text);
    e.currentTarget.replaceChildren();
  };
  return (
    <div
      ref={ref}
      contentEditable
      dir="auto"
      role="textbox"
      aria-multiline="true"
      aria-label="Agent message"
      className="min-h-24 rounded border border-slate-300 bg-white p-2 text-base outline-none focus:border-blue-500"
      onKeyDown={onKeyDown}
    />
  );
}
