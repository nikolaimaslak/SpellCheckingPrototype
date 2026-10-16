import { useEffect, useMemo, useRef, useState } from 'react';
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
  onIgnoredWordsChange: (text: string) => void;
}

export function MessageField({ settings, onLog, onAddToDictionary, onIgnoredWordsChange }: Props) {
  const options = useMemo(() => {
    const assistantOptions: AssistantOptions = {
      spellCheckMode: !settings.spellCheck ? 'off' : settings.autoCorrect ? 'auto-correct' : 'underline',
      customWords: lines(settings.customDictionary),
      ignoredWords: lines(settings.ignoredWords),
      onIgnoredWordsChange: (words) => onIgnoredWordsChange(words.join('\n')),
      withCompletion: settings.completion,
      debounceMs: settings.debounceMs,
      apiKey: settings.apiKey,
      canned: lines(settings.canned),
      kb: lines(settings.kb),
      conversation: settings.conversation,
      log: onLog,
    };
    return assistantOptions;
  }, [settings, onLog, onIgnoredWordsChange]);

  const fieldRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
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
          spellCheck={!settings.spellCheck}
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
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
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
        Click an underlined word for suggestions. Tab accepts the grey suggestion. Ctrl/Cmd+Z undoes any automatic change.
      </p>
      {assistant && (
        <>
          <PolishBar
            polish={state.polish}
            onPolish={() => void assistant.polishNow()}
            onAccept={assistant.acceptPolish}
            onDismiss={assistant.dismissPolish}
          />
          {state.ghost && isFocused && <GhostText ghost={state.ghost} fieldRef={fieldRef} />}
          {state.popover && (
            <SuggestionPopover
              key={`${state.popover.wordStartOffset}:${state.popover.wordEndOffset}`}
              popover={state.popover}
              fieldRef={fieldRef}
              onPick={assistant.pickSuggestion}
              onIgnore={assistant.ignoreWord}
              onAddToDictionary={(word) => {
                assistant.addToDictionary(word);
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
