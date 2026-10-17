export function Checkbox(props: {
  label: string;
  isChecked: boolean;
  isDisabled?: boolean;
  onChange: (isChecked: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${props.isDisabled ? 'text-slate-400' : ''}`}>
      <input type="checkbox" checked={props.isChecked} disabled={props.isDisabled} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}
