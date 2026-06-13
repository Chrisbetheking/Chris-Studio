import { useState, useEffect } from "react";
import { getLang, setLang, onLangChange } from "@tokenfence/shared/src/i18n";
import type { SupportedLanguage } from "@tokenfence/shared/src/i18n";

export function LanguageSwitcher() {
  const [lang, setLangState] = useState<SupportedLanguage>(getLang());

  useEffect(() => {
    const unsub = onLangChange((l) => setLangState(l));
    return unsub;
  }, []);

  const toggle = () => {
    const next = lang === "en" ? "zh-CN" : "en";
    setLang(next);
  };

  const label = lang === "en" ? "中文" : "English";

  return (
    <button
      onClick={toggle}
      className="lang-switcher"
      title={lang === "en" ? "Switch to Chinese" : "Switch to English"}
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        padding: "4px 10px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: "0.8rem",
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}
