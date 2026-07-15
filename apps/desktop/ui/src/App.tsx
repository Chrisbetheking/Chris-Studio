import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
import {
  MessageSquare, FolderOpen, Cpu, Wrench, Settings, Info,
  Shield, Route, FileText, Upload, Database, Archive,
  FlaskConical, Monitor, Puzzle, Brain, BarChart3, TestTubeDiagonal,
  Sun, Moon, Laptop, History, ClipboardCheck,
} from "lucide-react";
import { ChatWorkspace } from "./screens/ChatWorkspace";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProvidersScreen } from "./screens/ProvidersScreen";
import { AboutScreen } from "./screens/AboutScreen";
import { GuardScreen } from "./screens/GuardScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { MatrixScreen } from "./screens/MatrixScreen";
import { AgentLabScreen } from "./screens/AgentLabScreen";
import { PluginStoreScreen } from "./screens/PluginStoreScreen";
import { OutputScreen } from "./screens/OutputScreen";
import { MindMapScreen } from "./screens/MindMapScreen";
import { ComputerControlScreen } from "./screens/ComputerControlScreen";
import { RoutingScreen } from "./screens/RoutingScreen";
import { ArchiveScreen } from "./screens/ArchiveScreen";
import { StorageScreen } from "./screens/StorageScreen";
import { Dashboard } from "./screens/Dashboard";
import { HistoryScreen } from "./screens/HistoryScreen";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

type Screen = "chat" | "projects" | "models" | "toolbox" | "settings" | "about"
  | "guard" | "documents" | "matrix" | "providers" | "archive" | "storage"
  | "agent-lab" | "plugins" | "output" | "mindmap" | "computer" | "routing" | "dashboard"
  | "history";

type FeatureStatus = "working" | "preview" | "coming_soon" | "needs_runtime";

const VERSION = "v1.6.0";

interface NavItem {
  id: Screen;
  labelKey: string;
  icon: React.ReactNode;
}

const primaryNav: NavItem[] = [
  { id: "chat", labelKey: "nav.chat", icon: <MessageSquare size={18} /> },
  { id: "history", labelKey: "history.title", icon: <History size={18} /> },
  { id: "projects", labelKey: "common.projects", icon: <FolderOpen size={18} /> },
  { id: "models", labelKey: "common.models", icon: <Cpu size={18} /> },
  { id: "toolbox", labelKey: "common.toolbox", icon: <Wrench size={18} /> },
  { id: "settings", labelKey: "nav.settings", icon: <Settings size={18} /> },
  { id: "about", labelKey: "nav.about", icon: <Info size={18} /> },
];

type ToolGroup = {
  labelKey: string;
  items: { id: Screen; labelKey: string; status: FeatureStatus; icon: React.ReactNode }[];
};

const toolGroups: ToolGroup[] = [
  {
    labelKey: "common.security",
    items: [
      { id: "guard", labelKey: "nav.guard", status: "working", icon: <Shield size={18} /> },
      { id: "routing", labelKey: "nav.routing", status: "working", icon: <Route size={18} /> },
    ],
  },
  {
    labelKey: "common.documents",
    items: [
      { id: "documents", labelKey: "nav.documents", status: "preview", icon: <FileText size={18} /> },
      { id: "output", labelKey: "nav.outputs", status: "preview", icon: <Upload size={18} /> },
    ],
  },
  {
    labelKey: "common.knowledge",
    items: [
      { id: "storage", labelKey: "nav.storage", status: "preview", icon: <Database size={18} /> },
      { id: "archive", labelKey: "nav.archive", status: "coming_soon", icon: <Archive size={18} /> },
    ],
  },
  {
    labelKey: "common.agent",
    items: [
      { id: "agent-lab", labelKey: "nav.agentLab", status: "preview", icon: <FlaskConical size={18} /> },
      { id: "computer", labelKey: "nav.computerUse", status: "needs_runtime", icon: <Monitor size={18} /> },
      { id: "plugins", labelKey: "nav.plugins", status: "preview", icon: <Puzzle size={18} /> },
    ],
  },
  {
    labelKey: "common.creative",
    items: [
      { id: "mindmap", labelKey: "nav.mindMap", status: "preview", icon: <Brain size={18} /> },
      { id: "dashboard", labelKey: "nav.dashboard", status: "working", icon: <BarChart3 size={18} /> },
      { id: "matrix", labelKey: "nav.matrix", status: "preview", icon: <TestTubeDiagonal size={18} /> },
    ],
  },
];

function statusBadge(s: FeatureStatus): { label: string; className: string } {
  switch (s) {
    case "working": return { label: tk("common.working"), className: "badge-green" };
    case "preview": return { label: tk("common.preview"), className: "badge-amber" };
    case "coming_soon": return { label: tk("common.comingSoon"), className: "badge-slate" };
    case "needs_runtime": return { label: tk("common.needsLocalRuntime"), className: "badge-slate" };
  }
}

const screenLabels: Record<Screen, string> = {
  chat: "nav.chat", projects: "common.projects", models: "common.models",
  toolbox: "common.toolbox", settings: "nav.settings", about: "nav.about",
  guard: "nav.guard", documents: "nav.documents", matrix: "nav.matrix",
  providers: "nav.providers", archive: "nav.archive", storage: "nav.storage",
  "agent-lab": "nav.agentLab", plugins: "nav.plugins", output: "nav.outputs",
  mindmap: "nav.mindMap", computer: "nav.computerUse", routing: "nav.routing",
  dashboard: "nav.dashboard", history: "history.title",
};

const screens: Record<string, React.ReactNode> = {
  chat: <ChatWorkspace />,
  history: <HistoryScreen />,
  projects: <ProjectsScreen />,
  models: <ProvidersScreen />,
  settings: <SettingsScreen />,
  about: <AboutScreen />,
  guard: <GuardScreen />,
  documents: <DocumentsScreen />,
  matrix: <MatrixScreen />,
  providers: <ProvidersScreen />,
  archive: <ArchiveScreen />,
  storage: <StorageScreen />,
  "agent-lab": <AgentLabScreen />,
  plugins: <PluginStoreScreen />,
  output: <OutputScreen />,
  mindmap: <MindMapScreen />,
  computer: <ComputerControlScreen />,
  routing: <RoutingScreen />,
  dashboard: <Dashboard />,
  toolbox: null as any,
};

/* ---- Toolbox Screen ---- */
function ToolboxScreen() {
  const [activeTool, setActiveTool] = useState<Screen | null>(null);

  if (activeTool && screens[activeTool]) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--tf-border)" }}>
          <button onClick={() => setActiveTool(null)} className="tf-btn-ghost tf-btn-sm">
            &larr; {tk("actions.back")}
          </button>
          <span style={{ marginLeft: 12, fontWeight: 600, fontSize: "0.85rem", color: "var(--tf-text)" }}>
            {tk(screenLabels[activeTool])}
          </span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{screens[activeTool]}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">{tk("common.toolbox")}</h1>
        <p className="page-subtitle">{tk("common.toolGroupDesc")}</p>
      </div>
      {toolGroups.map((group) => (
        <div key={group.labelKey} style={{ marginBottom: 28 }}>
          <h3 className="tf-section-title">{tk(group.labelKey)}</h3>
          <div className="stats-grid">
            {group.items.map((item) => {
              const badge = statusBadge(item.status);
              return (
                <div
                  key={item.id}
                  className="stat-card"
                  style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
                  onClick={() => setActiveTool(item.id)}
                >
                  <div style={{ color: "var(--tf-primary)", display: "flex" }}>{item.icon}</div>
                  <div className="stat-label" style={{ fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>
                    {tk(item.labelKey)}
                  </div>
                  <span className={`badge ${badge.className}`} style={{ fontSize: "0.62rem" }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Theme Toggle ---- */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light" as const, label: "Light", icon: <Sun size={14} /> },
    { value: "dark" as const, label: "Dark", icon: <Moon size={14} /> },
    { value: "system" as const, label: "System", icon: <Laptop size={14} /> },
  ];
  return (
    <div className="theme-toggle-group" style={{ marginBottom: 8 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`theme-toggle-btn ${theme === opt.value ? "active" : ""}`}
          onClick={() => setTheme(opt.value)}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

/* ---- App Inner ---- */
function AppInner() {
  const [screen, setScreen] = useState<Screen>("chat");
  const [, forceRender] = useState(0);

  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  const currentContent = screen === "toolbox"
    ? <ToolboxScreen />
    : (screens[screen] ?? <ChatWorkspace />);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">TF</div>
          <span className="sidebar-brand-text">TokenFence</span>
        </div>

        <div className="sidebar-nav">
          {primaryNav.map(({ id, icon, labelKey }) => (
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
      <main className="main-content">{currentContent}</main>
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
