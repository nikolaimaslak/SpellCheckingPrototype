import { PRESETS } from '../lib/presets';
import { presetSettings } from '../lib/settings';
import { useSettings } from '../providers/SettingsProvider';

export function PresetPicker() {
  const { settings, updateSettings } = useSettings();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-semibold">Preset</span>
      <div className="flex">
        {Object.entries(PRESETS).map(([name, preset]) => {
          const fromPreset = presetSettings(preset);
          const isActive = settings.llmContext === fromPreset.llmContext && settings.customDictionary === fromPreset.customDictionary && settings.ignoredWords === fromPreset.ignoredWords;
          return (
            <button
              key={name}
              type="button"
              className={`border border-slate-300 px-2 py-0.5 text-xs first:rounded-l last:rounded-r not-first:-ml-px ${isActive ? 'bg-slate-100 font-semibold' : 'bg-white hover:bg-slate-50'}`}
              onClick={() => updateSettings(fromPreset)}
            >
              {name}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-slate-500">Fills the LLM context, the custom dictionary and the ignored words below.</span>
    </div>
  );
}
