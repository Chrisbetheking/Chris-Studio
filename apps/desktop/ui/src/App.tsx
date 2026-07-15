import { useState, useEffect } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
import {
  MessageSquare, History, Cpu, Settings, Info,
  Sun, Moon, Laptop,
} from "lucide-react";
import { ChatWorkspace } from "./screens/ChatWorkspace";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ProvidersScreen } from "./screens/ProvidersScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AboutScreen } from "./screens/AboutScreen";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

type Screen = "workspace" | "history" | "providers" | "settings" | "about";

const VERSION = "v1.6.0";

const navItems: { id: Screen; labelKey: string; icon: React.ReactNode }[] = [
  { id: "workspace", labelKey: "nav.workspace", icon: <MessageSquare size={18} /> },
  { id: "history", labelKey: "history.title", icon: <History size={18} /> },
  { id: "providers", labelKey: "nav.providers", icon: <Cpu size={18} /> },
  { id: "settings", labelKey: "nav.settings", icon: <Settings size={18} /> },
  { id: "about", labelKey: "nav.about", icon: <Info size={18} /> },
];

/* ---- Theme Toggle ---- */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light" as const, icon: <Sun size={14} /> },
    { value: "dark" as const, icon: <Moon size={14} /> },
    { value: "system" as const, icon: <Laptop size={14} /> },
  ];
  return (
    <div className="theme-toggle-group" style={{ marginBottom: 8 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`theme-toggle-btn ${theme === opt.value ? "active" : ""}`}
          onClick={() => setTheme(opt.value)}
          title={opt.value}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

/* ---- App Inner ---- */
function AppInner() {
  const [screen, setScreen] = useState<Screen>("workspace");
  const [, forceRender] = useState(0);

  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  const screens: Record<Screen, React.ReactNode> = {
    workspace: <ChatWorkspace />,
    history: <HistoryScreen />,
    providers: <ProvidersScreen />,
    settings: <SettingsScreen />,
    about: <AboutScreen />,
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">TF</div>
          <span className="sidebar-brand-text">TokenFence</span>
        </div>

        <div className="sidebar-nav">
          {navItems.map(({ id, icon, labelKey }) => (
            <button
              key={id}
              className={`sidebar-item ${screen === id ? "active" : ""}`}
              onClick={() => setScreen(id)}
              title={tk(labelKey)}
            >
              <span className="sidebar-item-icon">{icon}</span>
              <span className="sidebar-item-label">{tk(labelKey)}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <ThemeToggle />
          <LanguageSwitcher />
          <div className="status-indicator" style={{ marginTop: 8 }}>
            <span className="status-dot green"></span>
            <span>{tk("status.localFirst")}</span>
          </div>
          <div className="version-text">{VERSION}</div>
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">{screens[screen]}</main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
