/* i18n: Bilingual language support for TokenFence Studio */

import en from "./en";
import zhCN from "./zh-CN";
import { storeGet, storeSet } from "../agent-runtime/safeStorage";
import type { Translations } from "./en";

export type { Translations } from "./en";
export type SupportedLanguage = "en" | "zh-CN";

const locales: Record<SupportedLanguage, Translations> = {
  en,
  "zh-CN": zhCN,
};

let currentLang: SupportedLanguage = "en";
const listeners: Array<(lang: SupportedLanguage) => void> = [];

function persistLang(lang: SupportedLanguage): void {
  try {
    storeSet("tokenfence-lang", lang);
  } catch { /* noop */ }
}

function loadLang(): SupportedLanguage {
  try {
    const stored = storeGet("tokenfence-lang");
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch { /* noop */ }
  return "en";
}

/** Get the current active translations object */
export function t(): Translations {
  return locales[currentLang];
}

/** Get a nested translation value by dot-separated path with English fallback */
export function tk(path: string): string {
  const keys = path.split(".");
  let value: unknown = locales[currentLang];
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      // Fallback to English
      let fallback: unknown = locales.en;
      for (const k of keys) {
        if (fallback && typeof fallback === "object" && k in fallback) {
          fallback = (fallback as Record<string, unknown>)[k];
        } else {
          return path; // Return the key itself as last resort
        }
      }
      return typeof fallback === "string" ? fallback : path;
    }
  }
  return typeof value === "string" ? value : path;
}

/** Get current language */
export function getLang(): SupportedLanguage {
  return currentLang;
}

/** Set language, persist, notify listeners */
export function setLang(lang: SupportedLanguage): void {
  currentLang = lang;
  persistLang(lang);
  for (const fn of listeners) fn(lang);
}

/** Subscribe to language changes */
export function onLangChange(fn: (lang: SupportedLanguage) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/** Available language options for UI */
export function availableLanguages(): { code: SupportedLanguage; label: string }[] {
  return [
    { code: "en", label: "English" },
    { code: "zh-CN", label: "中文" },
  ];
}

// Initialize from storage
currentLang = loadLang();

export { en, zhCN };
