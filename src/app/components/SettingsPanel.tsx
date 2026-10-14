import { appendTurn } from '../lib/conversation';
import type { AppSettings } from '../lib/settings';
import { Checkbox, Section, TextArea } from './fields';
import { ScenarioControls } from './ScenarioControls';

interface Props {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
}

export function SettingsPanel({ settings, onUpdate, onReset }: Props) {
  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button type="button" className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100" onClick={onReset}>
          Reset
        </button>
      </div>

      <Section title="Model">
        <label className="block text-sm">
          OpenAI API key
          <input
            type="password"
            className="mt-1 block w-full rounded border border-slate-300 p-2 font-mono text-xs"
            autoComplete="off"
            value={settings.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value.trim() })}
          />
          <span className="mt-1 block text-xs text-slate-500">Spelling, completion and Polish all ask OpenAI. Saved in this browser only. Reset clears it.</span>
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
          rows={3}
          value={settings.customDictionary}
          onChange={(customDictionary) => onUpdate({ customDictionary })}
        />
      </Section>

      <Section title="Completion">
        <Checkbox label="Inline completion (Tab accepts)" checked={settings.completion} onChange={(completion) => onUpdate({ completion })} />
      </Section>

      <Section title="Sources">
        <ScenarioControls
          conversation={settings.conversation}
          onCustomerMessage={(text) => onUpdate({ conversation: appendTurn(settings.conversation, { role: 'customer', text }) })}
        />
        <TextArea
          label="Conversation"
          hint="Customer: / Agent: per line. Customer words are never auto-corrected. All of it goes to the LLM."
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

