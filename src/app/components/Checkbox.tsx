export function Checkbox(props: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${props.disabled ? 'text-slate-400' : ''}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}
