import { MODEL } from '../../assistant/llm/client';
import { CONTEXT_PRESETS } from '../lib/context-presets';
import type { AppSettings } from '../lib/settings';
import { Checkbox } from './Checkbox';
import { Section } from './Section';
import { TextArea } from './TextArea';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
  canApply: boolean;
  onApply: () => void;
}

export function SettingsPanel({ settings, onUpdate, onReset, canApply, onApply }: Props) {
  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="flex gap-2">
          <button type="button" className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100" onClick={onReset}>
            Reset
          </button>
          <button
            type="button"
            className="rounded border border-blue-600 bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700 disabled:border-slate-300 disabled:bg-white disabled:text-slate-400"
            disabled={!canApply}
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>

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
          <span className="mt-1 block text-xs text-slate-500">Spelling, completion and Polish all ask the LLM. Saved in this browser only. Reset clears it.</span>
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

      <Section title="Spelling">
        <Checkbox label="Spell check (underline + suggestions)" checked={settings.spellCheck} onChange={(spellCheck) => onUpdate({ spellCheck })} />
        <Checkbox
          label="Auto-correct words the model is sure about"
          checked={settings.autoCorrect}
          disabled={!settings.spellCheck}
          onChange={(autoCorrect) => onUpdate({ autoCorrect })}
        />
        <TextArea
          label="Custom dictionary"
          hint="One word per line. Never underlined, never auto-corrected."
          rows={5}
          value={settings.customDictionary}
          onChange={(customDictionary) => onUpdate({ customDictionary })}
        />
        <TextArea
          label="Ignored words"
          hint="One word per line. Still underlined when wrong, never auto-corrected. Ignore and Ctrl/Cmd+Z on an auto-correction add here."
          rows={5}
          value={settings.ignoredWords}
          onChange={(ignoredWords) => onUpdate({ ignoredWords })}
        />
      </Section>

      <Section title="Completion">
        <Checkbox label="Inline completion (Tab accepts)" checked={settings.completion} onChange={(completion) => onUpdate({ completion })} />
      </Section>

      <Section title="LLM context">
        <div className="flex items-center">
          <span className="mr-2 text-sm">Presets:</span>
          {Object.entries(CONTEXT_PRESETS).map(([name, preset]) => {
            const isApplied = settings.conversation === preset.conversation && settings.canned === preset.canned && settings.kb === preset.kb;
            return (
              <button
                key={name}
                type="button"
                className={`border border-slate-300 px-2 py-1 text-sm first:rounded-l last:rounded-r not-first:-ml-px ${isApplied ? 'bg-slate-100 font-semibold' : 'bg-white hover:bg-slate-50'}`}
                onClick={() => onUpdate(preset)}
              >
                {name}
              </button>
            );
          })}
        </div>
        <TextArea
          label="Conversation"
          hint="Customer: / Agent: per line. All of it goes to the LLM."
          rows={5}
          value={settings.conversation}
          onChange={(conversation) => onUpdate({ conversation })}
        />
        <TextArea
          label="Canned responses"
          hint="One per line, empty = off. All of them go to the LLM with every check."
          rows={5}
          value={settings.canned}
          disabled={!settings.completion}
          onChange={(canned) => onUpdate({ canned })}
        />
        <TextArea
          label="Knowledge base"
          hint="Title: text per line, empty = off. All of it goes to the LLM with every check."
          rows={5}
          value={settings.kb}
          disabled={!settings.completion}
          onChange={(kb) => onUpdate({ kb })}
        />
      </Section>
    </aside>
  );
}

