import type { AutoReplaceConfidence } from '../../autocorrect/confidence';
import type { Lang } from '../../spell/protocol';
import type { SpellStatus } from '../../spell/checker';
import { appendTurn } from '../lib/conversation';
import type { AppSettings } from '../lib/settings';
import { Checkbox, RadioGroup, Section, TextArea } from './fields';
import { ScenarioControls } from './ScenarioControls';

const AUTO_CORRECT_WHEN: { value: AutoReplaceConfidence; label: string }[] = [
  { value: 'list', label: "It's on the list of common typos (teh → the)" },
  { value: 'list-and-rule', label: "It's on the list, only a capital is wrong (oNly → only), or exactly one word is one typo away (paymnet → payment)" },
];
const LANG_NAMES: Record<Lang, string> = { en: 'English', ar: 'Arabic' };

interface Props {
  settings: AppSettings;
  spellStatus: SpellStatus | undefined;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
}

export function SettingsPanel({ settings, spellStatus, onUpdate, onReset }: Props) {
  const toggleLang = (lang: Lang, on: boolean) =>
    onUpdate({ languages: (['en', 'ar'] as Lang[]).filter((l) => (l === lang ? on : settings.languages.includes(l))) });

  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button type="button" className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100" onClick={onReset}>
          Reset
        </button>
      </div>

      <Section title="Spelling">
        <Checkbox label="Spell check (underline + suggestions)" checked={settings.spellCheck} onChange={(spellCheck) => onUpdate({ spellCheck })} />
        <Checkbox
          label="Auto-correct on space or punctuation"
          checked={settings.autoCorrect}
          disabled={!settings.spellCheck}
          onChange={(autoCorrect) => onUpdate({ autoCorrect })}
        />
        <p className="text-xs text-slate-500">Auto-correct when</p>
        <RadioGroup
          name="autoReplace"
          value={settings.autoReplace}
          options={AUTO_CORRECT_WHEN}
          disabled={!settings.spellCheck || !settings.autoCorrect}
          onChange={(autoReplace) => onUpdate({ autoReplace })}
        />
        <div className="flex gap-4">
          {(['en', 'ar'] as Lang[]).map((lang) => (
            <Checkbox key={lang} label={LANG_NAMES[lang]} checked={settings.languages.includes(lang)} onChange={(on) => toggleLang(lang, on)} />
          ))}
        </div>
        <SpellStatus status={spellStatus} />
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
        <label className="block text-sm">
          OpenAI API key
          <input
            type="password"
            className="mt-1 block w-full rounded border border-slate-300 p-2 font-mono text-xs"
            autoComplete="off"
            value={settings.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value.trim() })}
          />
          <span className="mt-1 block text-xs text-slate-500">Used by completion and Polish. Saved in this browser only. Reset clears it.</span>
        </label>
      </Section>

      <Section title="Sources">
        <ScenarioControls
          conversation={settings.conversation}
          onCustomerMessage={(text) => onUpdate({ conversation: appendTurn(settings.conversation, { role: 'customer', text }) })}
        />
        <TextArea
          label="Conversation"
          hint="Customer: / Agent: per line. Customer words are never auto-corrected. The last customer line picks canned responses and KB. All of it goes to the LLM."
          rows={5}
          value={settings.conversation}
          onChange={(conversation) => onUpdate({ conversation })}
        />
        <TextArea
          label="Canned responses"
          hint="One per line, empty = off. Up to 3 that match the last customer line go to the LLM."
          rows={5}
          value={settings.canned}
          disabled={!settings.completion}
          onChange={(canned) => onUpdate({ canned })}
        />
        <TextArea
          label="Knowledge base"
          hint="Title: text per line, empty = off. Up to 2 strong matches with the last customer line go to the LLM."
          rows={5}
          value={settings.kb}
          disabled={!settings.completion}
          onChange={(kb) => onUpdate({ kb })}
        />
      </Section>
    </aside>
  );
}

function SpellStatus({ status }: { status: SpellStatus | undefined }) {
  if (!status) return null;
  const parts = [
    ...status.loaded.map((l) => `${l.lang} ready (${l.ms} ms)`),
    ...status.pending.map((l) => `${l} loading…`),
    ...status.failed.map((f) => `${f.lang} failed: ${f.reason}`),
  ];
  return <p className="text-xs text-slate-500">Dictionaries: {parts.join(' · ') || 'none'}</p>;
}
