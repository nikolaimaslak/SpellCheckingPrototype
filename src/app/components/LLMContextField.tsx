import { useSettings } from '../providers/SettingsProvider';

export function LLMContextField() {
  const { settings, updateSettings } = useSettings();
  const value = settings.llmContext;
  const onChange = (llmContext: string) => updateSettings({ llmContext });
  return (
    <section className="flex min-w-0 flex-col gap-1 lg:row-span-3 lg:grid lg:grid-rows-subgrid">
      <div className="flex h-6 items-center">
        <h2 className="text-sm font-semibold">LLM context</h2>
      </div>
      <textarea
        className="block h-28 w-full resize-none rounded border border-slate-300 p-2 font-mono text-xs lg:h-full lg:min-h-0 [unicode-bidi:plaintext]"
        dir="auto"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-slate-500">Context for auto-completion and auto-correction: agent data, customer data, the conversation, case fields, canned responses and related knowledge base articles.</p>
    </section>
  );
}
