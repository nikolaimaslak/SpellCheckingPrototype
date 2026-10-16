export function TextArea(props: { label: string; hint?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="flex h-6 items-center text-sm font-semibold">{props.label}</span>
      <textarea
        className="block h-40 w-full resize-none rounded border border-slate-300 p-2 font-mono text-xs md:h-auto md:min-h-0 md:flex-1"
        dir="auto"
        spellCheck={false}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <span className="block text-xs text-slate-500">{props.hint}</span>}
    </label>
  );
}
