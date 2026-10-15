import { useCallback, useEffect, useState } from 'react';
import { clearSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '../lib/settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  useEffect(() => saveSettings(settings), [settings]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>)) =>
      setSettings((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) })),
    [],
  );
  const resetSettings = useCallback(() => {
    clearSettings();
    setSettings(DEFAULT_SETTINGS);
  }, []);
  return { settings, updateSettings, resetSettings };
}
