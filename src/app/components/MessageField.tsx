import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { AssistantOptions } from '../../assistant';
import { useAssistant } from '../hooks/useAssistant';
import { GhostText } from './GhostText';
import { PolishBar } from './PolishBar';
import { SuggestionPopover } from './SuggestionPopover';

interface Props {
  /** Re-attaches when it changes; pass a stable object. */
  options: AssistantOptions;
  /** Enter: the message is added to the Conversation field as Agent, and the field is cleared. */
  onSend: (text: string) => void;
}

/**
 * The agent's message field and what the assistant draws around it. The
 * field's content is owned by the browser and the assistant, never rendered
 * by React: it has no children here. The field's events go to the assistant.
 */
export function MessageField({ options, onSend }: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const { assistant, state } = useAssistant(fieldRef, options);

  // The caret, scrolling and resizing happen outside the field's own events.
  useEffect(() => {
    if (!assistant) return;
    document.addEventListener('selectionchange', assistant.handleSelectionChange);
    window.addEventListener('resize', assistant.handleLayoutChange);
    window.addEventListener('scroll', assistant.handleLayoutChange, true);
    return () => {
      document.removeEventListener('selectionchange', assistant.handleSelectionChange);
      window.removeEventListener('resize', assistant.handleLayoutChange);
      window.removeEventListener('scroll', assistant.handleLayoutChange, true);
    };
  }, [assistant]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    assistant?.handleKeyDown(e.nativeEvent);
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !e.nativeEvent.defaultPrevented) {
      e.preventDefault();
      const text = e.currentTarget.innerText.trim();
      if (!text) return;
      onSend(text);
      e.currentTarget.replaceChildren();
      assistant?.handleCleared();
    }
  };

  return (
    <section className="space-y-2">
      <div
        ref={fieldRef}
        contentEditable
        dir="auto"
        role="textbox"
        aria-multiline="true"
        aria-label="Agent message"
        className="min-h-24 rounded border border-slate-300 bg-white p-2 text-base outline-none focus:border-blue-500"
        onInput={(e) => assistant?.handleInput(e.nativeEvent as InputEvent)}
        onKeyDown={onKeyDown}
        onMouseUp={() => assistant?.handleClick()}
        onCompositionStart={() => assistant?.handleCompositionStart()}
        onCompositionEnd={() => assistant?.handleCompositionEnd()}
        onBlur={() => assistant?.handleBlur()}
        onScroll={() => assistant?.handleLayoutChange()}
      />
      <p className="text-xs text-slate-500">
        Enter adds the message to Conversation as Agent, Shift+Enter breaks the line. Click an underlined word (or Ctrl+.) for suggestions. Tab accepts the grey suggestion. Ctrl/Cmd+Z undoes any automatic change.
      </p>
      {assistant && (
        <>
          <PolishBar
            polish={state.polish}
            onPolish={() => void assistant.polishNow()}
            onAccept={assistant.acceptPolish}
            onDismiss={assistant.dismissPolish}
          />
          {state.ghost && <GhostText ghost={state.ghost} />}
          {state.popover && (
            <SuggestionPopover
              // A new word starts with the first item focused.
              key={`${state.popover.wordRect.left}:${state.popover.wordRect.top}`}
              popover={state.popover}
              onPick={assistant.pickSuggestion}
              onIgnore={assistant.ignoreWord}
              onClose={assistant.closePopover}
            />
          )}
        </>
      )}
    </section>
  );
}
