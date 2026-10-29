import { ApiKeyField } from './components/ApiKeyField';
import { Debugger } from './components/Debugger';
import { DebuggerProvider } from './providers/DebuggerProvider';
import { LLMContextField } from './components/LLMContextField';
import { MessageField } from './components/MessageField';
import { PresetPicker } from './components/PresetPicker';
import { SettingsProvider } from './providers/SettingsProvider';
import { WordListFields } from './components/WordListFields';

export function App() {
  return (
    <SettingsProvider>
      <DebuggerProvider>
        <div className="mx-auto max-w-6xl space-y-4 p-4">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">Auto-completion and auto-correction demo</h1>
            <ApiKeyField />
          </header>
          <main className="space-y-4">
            <MessageField />
            <section className="space-y-2 pt-4">
              <PresetPicker />
              <div className="flex flex-col gap-3 lg:grid lg:h-48 lg:resize-y lg:grid-cols-[minmax(0,1fr)_9rem_9rem] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-x-3 lg:gap-y-1 lg:overflow-hidden">
                <LLMContextField />
                <WordListFields />
              </div>
            </section>
            <Debugger />
          </main>
        </div>
      </DebuggerProvider>
    </SettingsProvider>
  );
}
