import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssistEvent } from '../../assistant';
import { isMac } from '../../assistant/browser';
import { useAssistant } from '../hooks/useAssistant';
import type { AppSettings } from '../lib/settings';
import { GhostText } from './GhostText';
import { SpellingFixesPreview } from './SpellingFixesPreview';
import { DebounceRing } from './DebounceRing';
import { SuggestionPopover } from './SuggestionPopover';

interface Props {
  settings: AppSettings;
  toolbar: ReactNode;
  onLog: (event: AssistEvent) => void;
  onAddToDictionary: (word: string) => void;
  onIgnoredWordsChange: (text: string) => void;
}

export function MessageField({ settings, toolbar, onLog, onAddToDictionary, onIgnoredWordsChange }: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const hasApiKey = !!settings.apiKey;
  const { assistant, state } = useAssistant(fieldRef, settings, onLog, onIgnoredWordsChange);

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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <h2 className="mr-auto text-lg font-semibold">Message field</h2>
        {toolbar}
      </div>
      <div className="relative">
        <div
          ref={fieldRef}
          contentEditable={hasApiKey}
          aria-disabled={!hasApiKey}
          spellCheck={!settings.spellCheck}
          dir="auto"
          role="textbox"
          aria-multiline="true"
          aria-label="Agent message"
          aria-placeholder={hasApiKey ? 'Type your message to the customer…' : 'Paste your API key above to start typing.'}
          className={`relative min-h-40 resize-y overflow-auto rounded-lg border border-slate-300 bg-white p-3 aria-disabled:cursor-not-allowed aria-disabled:bg-slate-50 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${isEmpty ? 'before:pointer-events-none before:absolute before:text-slate-400 before:content-[attr(aria-placeholder)]' : ''}`}
          onInput={(e) => {
            setIsEmpty(!e.currentTarget.textContent);
            assistant?.handleInput(e.nativeEvent as InputEvent);
          }}
          onKeyDown={(e) => assistant?.handleKeyDown(e.nativeEvent)}
          onKeyUp={(e) => assistant?.handleKeyUp(e.nativeEvent)}
          onMouseUp={() => assistant?.handleClick()}
          onCompositionStart={() => assistant?.handleCompositionStart()}
          onCompositionEnd={() => assistant?.handleCompositionEnd()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {state.loader?.kind === 'debounce' && <DebounceRing key={state.loader.startedAt} durationMs={state.loader.durationMs} />}
        {(state.loader?.kind === 'request' || state.fixSpelling.busy) && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 right-2 size-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
          />
        )}
      </div>
      <dl className="grid grid-cols-[auto_auto] justify-start items-center gap-x-3 gap-y-1 text-sm text-slate-600 [&_dt]:flex [&_dt]:justify-end [&_dt]:gap-1 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-b-2 [&_kbd]:border-slate-300 [&_kbd]:bg-slate-50 [&_kbd]:px-1.5 [&_kbd]:font-mono [&_kbd]:text-xs">
        <dt>
          <kbd>Tab</kbd>
        </dt>
        <dd>accept the grey suggestion</dd>
        <dt>
          <kbd>{isMac ? 'Option' : 'Ctrl'}</kbd>
          <kbd>→</kbd>
        </dt>
        <dd>accept one word of it</dd>
        <dt>
          <kbd>Esc</kbd>
        </dt>
        <dd>hide the suggestion or close the popup</dd>
        <dt>
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <kbd>Enter</kbd>
        </dt>
        <dd>pick a fix in the popup</dd>
        <dt>
          <kbd>{isMac ? 'Cmd' : 'Ctrl'}</kbd>
          <kbd>Z</kbd>
        </dt>
        <dd>undo an auto-correction</dd>
      </dl>
      {assistant && (
        <>
          {state.fixSpelling.preview && (
            <SpellingFixesPreview preview={state.fixSpelling.preview} onAccept={assistant.acceptSpellingFixes} onDismiss={assistant.dismissSpellingFixes} />
          )}
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
