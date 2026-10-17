import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '../lib/settings';

const APPLY_SETTINGS_DEBOUNCE_MS = 500;

export interface SettingsContextValue {
  settings: AppSettings;
  appliedSettings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings is used outside SettingsProvider');
  }
  return value;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [appliedSettings, setAppliedSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSettings(settings), APPLY_SETTINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const value = useMemo(() => {
    const settingsContextValue: SettingsContextValue = {
      settings,
      appliedSettings,
      updateSettings,
    };
    return settingsContextValue;
  }, [settings, appliedSettings, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
