import { useSettings } from '../providers/SettingsProvider';
import { TextArea } from './TextArea';

export function WordListFields() {
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <TextArea label="Custom dictionary" hint="Never underlined." value={settings.customDictionary} onChange={(customDictionary) => updateSettings({ customDictionary })} />
      <TextArea label="Ignored words" hint="Never auto-corrected." value={settings.ignoredWords} onChange={(ignoredWords) => updateSettings({ ignoredWords })} />
    </>
  );
}
