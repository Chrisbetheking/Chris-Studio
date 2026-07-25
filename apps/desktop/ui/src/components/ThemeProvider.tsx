import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeCtx = createContext<ThemeContextType>({ theme: "system", resolved: "light", setTheme: () => {} });
export const useTheme = () => useContext(ThemeCtx);

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return getSystemPreference();
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("tokenfence-theme");
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {}
    return "system";
  });

  const [resolved, setResolved] = useState<"light" | "dark">(() => resolveTheme(theme));

  // Apply data-theme to <html>
  const applyTheme = useCallback((t: Theme) => {
    const r = resolveTheme(t);
    setResolved(r);
    // Add transition class temporarily
    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.setAttribute("data-theme", r);
    setTimeout(() => document.documentElement.classList.remove("theme-transitioning"), 300);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("tokenfence-theme", t); } catch {}
    applyTheme(t);
  }, [applyTheme]);

  // Initial apply
  useEffect(() => { applyTheme(theme); }, []);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") applyTheme("system"); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}