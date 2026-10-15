import { useId } from 'react';

export function TextArea(props: {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  disabled?: boolean;
  presets?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="text-sm">
      <div className="flex items-end justify-between">
        <label htmlFor={id} className={props.disabled ? 'text-slate-400' : ''}>
          {props.label}
        </label>
        {props.presets && (
          <div className="flex">
            {Object.entries(props.presets).map(([name, text]) => (
              <button
                key={name}
                type="button"
                className={`-mb-px border border-slate-300 px-2 py-0.5 text-xs first:rounded-tl last:rounded-tr not-first:-ml-px ${props.value === text ? 'bg-slate-100 font-semibold' : 'bg-white hover:bg-slate-50'}`}
                onClick={() => props.onChange(text)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        id={id}
        className={`block w-full rounded border border-slate-300 p-2 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400 ${props.presets ? 'rounded-tr-none' : 'mt-1'}`}
        dir="auto"
        spellCheck={false}
        rows={props.rows ?? 4}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <span className="mt-1 block text-xs text-slate-500">{props.hint}</span>}
    </div>
  );
}
