export function TextArea(props: { label: string; hint?: string; value: string; rows?: number; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className={props.disabled ? 'text-slate-400' : ''}>{props.label}</span>
      <textarea
        className="mt-1 block w-full rounded border border-slate-300 p-2 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400"
        dir="auto"
        spellCheck={false}
        rows={props.rows ?? 4}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <span className="mt-1 block text-xs text-slate-500">{props.hint}</span>}
    </label>
  );
}
