export function TextArea(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 lg:row-span-3 lg:grid lg:grid-rows-subgrid">
      <span className="flex h-6 items-center text-sm font-semibold">{props.label}</span>
      <textarea
        className="block h-28 w-full resize-none rounded border border-slate-300 p-2 font-mono text-xs lg:h-full lg:min-h-0"
        dir="auto"
        spellCheck={false}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <span className="block text-xs text-slate-500">{props.hint}</span>}
    </label>
  );
}
