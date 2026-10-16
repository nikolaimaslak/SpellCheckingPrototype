import { CONTEXT_PRESETS } from '../lib/context-presets';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function LLMContextField({ value, onChange }: Props) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex h-6 items-center justify-between">
        <h2 className="text-sm font-semibold">LLM context</h2>
        <div className="flex items-center">
          <span className="mr-2 text-xs text-slate-500">Presets:</span>
          {Object.entries(CONTEXT_PRESETS).map(([name, preset]) => (
            <button
              key={name}
              type="button"
              className={`border border-slate-300 px-2 py-0.5 text-xs first:rounded-l last:rounded-r not-first:-ml-px ${value === preset ? 'bg-slate-100 font-semibold' : 'bg-white hover:bg-slate-50'}`}
              onClick={() => onChange(preset)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="block h-40 w-full resize-none rounded border border-slate-300 p-2 font-mono text-xs md:h-auto md:min-h-0 md:flex-1 [unicode-bidi:plaintext]"
        dir="auto"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-slate-500">All of it goes to the LLM with every request.</p>
    </section>
  );
}
