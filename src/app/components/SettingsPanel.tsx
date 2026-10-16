import { MODEL } from '../../assistant/llm';
import type { AppSettings } from '../lib/settings';
import { Section } from './Section';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

export function SettingsPanel({ settings, onUpdate }: Props) {
  return (
    <aside className="space-y-3">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Section title="LLM">
        <label className="block text-sm">
          Model
          <select disabled className="mt-1 block w-full rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-500">
            <option>{MODEL}</option>
          </select>
        </label>
        <label className="block text-sm">
          OpenAI API key
          <input
            type="password"
            className={`mt-1 block w-full rounded border p-2 font-mono text-xs ${settings.apiKey ? 'border-slate-300' : 'border-amber-500 ring-2 ring-amber-200'}`}
            placeholder={settings.apiKey ? undefined : 'Paste your API key to turn the assistant on'}
            autoComplete="off"
            value={settings.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value.trim() })}
          />
          <span className="mt-1 block text-xs text-slate-500">Spelling, completion and Fix spelling all ask the LLM. Kept in memory only, never saved.</span>
        </label>
        <label className="block text-sm">
          Debounce, ms
          <input
            type="number"
            min={0}
            step={100}
            className="mt-1 block w-full rounded border border-slate-300 p-2 font-mono text-xs"
            value={settings.debounceMs}
            onChange={(e) => onUpdate({ debounceMs: Math.max(0, e.target.valueAsNumber || 0) })}
          />
          <span className="mt-1 block text-xs text-slate-500">Pause after the last keystroke before the text is sent to the model.</span>
        </label>
      </Section>
    </aside>
  );
}

