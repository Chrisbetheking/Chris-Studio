import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings } from '@shared/types';

const SETTINGS_KEY = 'tf_settings';
const DEFAULT_SETTINGS: AppSettings = {
  localOnly: false, defaultProvider: 'OpenAI',
  defaultModel: 'gpt-4o', storeSanitizedOnly: true,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS; }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
