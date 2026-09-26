import type { AppSettings, Language } from '../app/types';
import { loadSettings, saveSettings } from '../app/store';

export function LanguageSwitcher({ language }: { language: Language }) {
  const setLanguage = (next: Language) => {
    const settings: AppSettings = loadSettings();
    if (settings.language === next) return;
    saveSettings({ ...settings, language: next });
  };

  return (
    <div className="language-switcher" role="group" aria-label="Language">
      <button type="button" className={language === 'zh-CN' ? 'active' : ''} onClick={() => setLanguage('zh-CN')}>中</button>
      <span>/</span>
      <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
}
