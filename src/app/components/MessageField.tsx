import { useEffect, useMemo, useRef } from 'react';
import type { AssistantOptions, AssistEvent } from '../../assistant';
import { useAssistant } from '../hooks/useAssistant';
import { lines, type AppSettings } from '../lib/settings';
import { GhostText } from './GhostText';
import { PolishBar } from './PolishBar';
import { PauseRing } from './PauseRing';
import { SuggestionPopover } from './SuggestionPopover';

interface Props {
  settings: AppSettings;
  onLog: (event: AssistEvent) => void;
  onAddToDictionary: (word: string) => void;
}

/**
 * The agent's message field and what the assistant draws around it. The
 * field's content is owned by the browser and the assistant, never rendered
 * by React: it has no children here. The field's events go to the assistant.
 */
export function MessageField({ settings, onLog, onAddToDictionary }: Props) {
  const options = useMemo(() => {
    const assistantOptions: AssistantOptions = {
      spelling: !settings.spellCheck ? 'off' : settings.autoCorrect ? 'auto' : 'suggest',
      customWords: lines(settings.customDictionary),
      completion: settings.completion,
      debounceMs: settings.debounceMs,
      apiKey: settings.apiKey,
      canned: lines(settings.canned),
      kb: lines(settings.kb),
      conversation: settings.conversation,
      log: onLog,
    };
    return assistantOptions;
  }, [settings, onLog]);

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
          className="min-h-24 resize-y overflow-auto rounded border border-slate-300 bg-white p-2 text-base outline-none focus:border-blue-500"
          onInput={(e) => assistant?.handleInput(e.nativeEvent as InputEvent)}
          onKeyDown={(e) => assistant?.handleKeyDown(e.nativeEvent)}
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
        Click an underlined word (or Ctrl+.) for suggestions. Tab accepts the grey suggestion. Ctrl/Cmd+Z undoes any automatic change.
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
