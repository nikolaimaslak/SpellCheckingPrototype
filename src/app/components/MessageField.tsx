import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import type { AssistEvent } from '../../assistant';
import type { Turn } from '../../assistant/types';
import { useAssistant } from '../hooks/useAssistant';
import { assistantOptions, type AppSettings } from '../lib/settings';
import { GhostText } from './GhostText';
import { PolishBar } from './PolishBar';
import { PauseRing } from './PauseRing';
import { SuggestionPopover } from './SuggestionPopover';

interface Props {
  /** Changing any of them except the conversation re-attaches the assistant. */
  settings: AppSettings;
  /** Read on every request, so editing the conversation never re-attaches (which would forget ignored words). */
  readConversation: () => Turn[];
  onLog: (event: AssistEvent) => void;
  /** Enter: the message is added to the Conversation field as Agent, and the field is cleared. */
  onSend: (text: string) => void;
  onAddToDictionary: (word: string) => void;
}

/**
 * The agent's message field and what the assistant draws around it. The
 * field's content is owned by the browser and the assistant, never rendered
 * by React: it has no children here. The field's events go to the assistant.
 */
export function MessageField({ settings, readConversation, onLog, onSend, onAddToDictionary }: Props) {
  const { conversation: _conversation, ...attachedSettings } = settings;
  const attachedKey = JSON.stringify(attachedSettings);
  const options = useMemo(
    () => assistantOptions(JSON.parse(attachedKey), readConversation, onLog),
    [attachedKey, readConversation, onLog],
  );

  const fieldRef = useRef<HTMLDivElement>(null);
  const { assistant, state } = useAssistant(fieldRef, options);

  useEffect(() => {
    if (!assistant) {
      return;
    }
    document.addEventListener('selectionchange', assistant.handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', assistant.handleSelectionChange);
    };
  }, [assistant]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    assistant?.handleKeyDown(e.nativeEvent);
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !e.nativeEvent.defaultPrevented) {
      e.preventDefault();
      const text = e.currentTarget.innerText.trim();
      if (!text) {
        return;
      }
      onSend(text);
      e.currentTarget.replaceChildren();
      assistant?.handleCleared();
    }
  };

  return (
    <section className="space-y-2">
      <div className="relative">
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
          onKeyUp={(e) => assistant?.handleKeyUp(e.nativeEvent)}
          onMouseUp={() => assistant?.handleClick()}
          onCompositionStart={() => assistant?.handleCompositionStart()}
          onCompositionEnd={() => assistant?.handleCompositionEnd()}
          onFocus={() => assistant?.handleFocusChange()}
          onBlur={() => assistant?.handleFocusChange()}
        />
        {state.loader?.kind === 'pause' && <PauseRing key={state.loader.startedAt} durationMs={state.loader.durationMs} />}
        {(state.loader?.kind === 'request' || state.polish.busy) && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 right-2 size-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
          />
        )}
      </div>
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
          {state.ghost && <GhostText ghost={state.ghost} fieldRef={fieldRef} />}
          {state.popover && (
            <SuggestionPopover
              // A new word starts with the first item focused.
              key={`${state.popover.wordStartOffset}:${state.popover.wordEndOffset}`}
              popover={state.popover}
              fieldRef={fieldRef}
              onPick={assistant.pickSuggestion}
              onIgnore={assistant.ignoreWord}
              onAddToDictionary={(word) => {
                assistant.ignoreWord();
                onAddToDictionary(word);
              }}
              onClose={assistant.closePopover}
            />
          )}
        </>
      )}
    </section>
  );
}
