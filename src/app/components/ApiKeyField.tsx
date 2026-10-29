import { useSettings } from '../providers/SettingsProvider';

export function ApiKeyField() {
  const { settings, updateSettings } = useSettings();
  const value = settings.apiKey;
  return (
    <label className="block w-80 max-w-full text-sm">
      LLM API key
      <input
        type="password"
        className={`mt-1 block w-full rounded border p-2 font-mono text-xs ${value ? 'border-slate-300' : 'border-amber-500 ring-2 ring-amber-200'}`}
        placeholder={value ? undefined : 'Paste your API key to turn the assistant on'}
        autoComplete="off"
        value={value}
        onChange={(e) => updateSettings({ apiKey: e.target.value.trim() })}
      />
    </label>
  );
}
