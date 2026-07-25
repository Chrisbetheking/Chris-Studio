/* i18n: Bilingual language support for TokenFence Studio (Android) */

import en from "./en";
import zhCN from "./zh-CN";
import type { Translations } from "./en";

export type { Translations } from "./en";
export type SupportedLanguage = "en" | "zh-CN";

const fenceStore: Record<string, string> = {};

const locales: Record<SupportedLanguage, Translations> = {
  en,
  "zh-CN": zhCN,
};

let currentLang: SupportedLanguage = "en";
const listeners: Array<(lang: SupportedLanguage) => void> = [];

function persistLang(lang: SupportedLanguage): void {
  try { fenceStore["tokenfence-lang"] = lang; } catch { /* noop */ }
}

function loadLang(): SupportedLanguage {
  try {
    const stored = fenceStore["tokenfence-lang"];
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch { /* noop */ }
  return "en";
}

export function t(): Translations {
  return locales[currentLang];
}

export function tk(path: string): string {
  const keys = path.split(".");
  let value: unknown = locales[currentLang];
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      let fallback: unknown = locales.en;
      for (const k of keys) {
        if (fallback && typeof fallback === "object" && k in fallback) {
          fallback = (fallback as Record<string, unknown>)[k];
        } else {
          return path;
        }
      }
      return typeof fallback === "string" ? fallback : path;
    }
  }
  return typeof value === "string" ? value : path;
}

export function getLang(): SupportedLanguage { return currentLang; }

export function setLang(lang: SupportedLanguage): void {
  currentLang = lang;
  persistLang(lang);
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn: (lang: SupportedLanguage) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function availableLanguages(): { code: SupportedLanguage; label: string }[] {
  return [
    { code: "en", label: "English" },
    { code: "zh-CN", label: "中文" },
  ];
}

currentLang = loadLang();

export { en, zhCN };
