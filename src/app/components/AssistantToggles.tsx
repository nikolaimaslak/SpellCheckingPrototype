import { useSettings } from '../providers/SettingsProvider';
import { Checkbox } from './Checkbox';

export function AssistantToggles() {
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <Checkbox label="Spell check" isChecked={settings.withSpellCheck} onChange={(withSpellCheck) => updateSettings({ withSpellCheck })} />
      <Checkbox
        label="Auto-correction"
        isChecked={settings.withAutoCorrection}
        isDisabled={!settings.withSpellCheck}
        onChange={(withAutoCorrection) => updateSettings({ withAutoCorrection })}
      />
      <Checkbox label="Auto-completion" isChecked={settings.withAutoCompletion} onChange={(withAutoCompletion) => updateSettings({ withAutoCompletion })} />
    </>
  );
}
