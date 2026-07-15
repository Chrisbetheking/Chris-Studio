import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
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
import { LanguageSwitcher } from "./components/LanguageSwitcher";

type Screen = "chat" | "projects" | "models" | "toolbox" | "settings" | "about"
  | "guard" | "documents" | "matrix" | "providers" | "archive" | "storage"
  | "agent-lab" | "plugins" | "output" | "mindmap" | "computer" | "routing" | "dashboard";

type FeatureStatus = "working" | "preview" | "coming_soon" | "needs_runtime";

const VERSION = "v1.6.0";

const primaryNav: { id: Screen; icon: string }[] = [
  { id: "chat", icon: "" },
  { id: "projects", icon: "" },
  { id: "models", icon: "" },
  { id: "toolbox", icon: "" },
  { id: "settings", icon: "" },
  { id: "about", icon: "" },
];

type ToolGroup = {
  labelKey: string;
  items: { id: Screen; labelKey: string; status: FeatureStatus; icon: string }[];
};

const toolGroups: ToolGroup[] = [
  {
    labelKey: "common.security",
    items: [
      { id: "guard", labelKey: "nav.guard", status: "working", icon: "" },
      { id: "routing", labelKey: "nav.routing", status: "working", icon: "" },
    ],
  },
  {
    labelKey: "common.documents",
    items: [
      { id: "documents", labelKey: "nav.documents", status: "preview", icon: "" },
      { id: "output", labelKey: "nav.outputs", status: "preview", icon: "" },
    ],
  },
  {
    labelKey: "common.knowledge",
    items: [
      { id: "storage", labelKey: "nav.storage", status: "preview", icon: "" },
      { id: "archive", labelKey: "nav.archive", status: "coming_soon", icon: "" },
    ],
  },
  {
    labelKey: "common.agent",
    items: [
      { id: "agent-lab", labelKey: "nav.agentLab", status: "preview", icon: "" },
      { id: "computer", labelKey: "nav.computerUse", status: "needs_runtime", icon: "" },
      { id: "plugins", labelKey: "nav.plugins", status: "preview", icon: "" },
    ],
  },
  {
    labelKey: "common.creative",
    items: [
      { id: "mindmap", labelKey: "nav.mindMap", status: "preview", icon: "" },
      { id: "dashboard", labelKey: "nav.dashboard", status: "working", icon: "" },
      { id: "matrix", labelKey: "nav.matrix", status: "preview", icon: "" },
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
  dashboard: "nav.dashboard",
};

const screens: Record<string, React.ReactNode> = {
  chat: <ChatWorkspace />,
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
};

/* ---- ToolboxScreen â€?independent full-page layout ---- */
function ToolboxScreen() {
  const [activeTool, setActiveTool] = useState<Screen | null>(null);
  if (activeTool && screens[activeTool]) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--tf-bg)" }}>
        <div style={{
          padding: "10px 20px", borderBottom: "1px solid var(--tf-border)",
          display: "flex", alignItems: "center", gap: 14,
          background: "var(--tf-surface)"
        }}>
          <button onClick={() => setActiveTool(null)} className="btn btn-ghost" style={{ fontSize: 12, fontWeight: 600 }}>
            {"\u2190"} {tk("actions.back")}
          </button>
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--tf-text)" }}>{tk(screenLabels[activeTool])}</span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{screens[activeTool]}</div>
      </div>
    );
  }
  return (
    <div style={{ padding: "32px 36px", maxWidth: 1280, margin: "0 auto", width: "100%", overflow: "auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--tf-text)", marginBottom: 6 }}>{tk("common.toolbox")}</h1>
      <p style={{ fontSize: 14, color: "var(--tf-text-muted)", marginBottom: 32 }}>
        Tools and utilities â€?status labels show readiness.
      </p>
      {toolGroups.map((group) => (
        <div key={group.labelKey} style={{ marginBottom: 28 }}>
          <h3 style={{
            fontSize: 12, fontWeight: 700,
            color: "var(--tf-text-muted)", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: "0.06em"
          }}>
            {tk(group.labelKey)}
          </h3>
          <div className="stats-grid">
            {group.items.map((item) => {
              const badge = statusBadge(item.status);
              return (
                <div
                  key={item.id}
                  className="stat-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => setActiveTool(item.id)}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
                  <div className="stat-label" style={{ fontSize: 13, fontWeight: 600 }}>{tk(item.labelKey)}</div>
                  <span className={`badge ${badge.className}`} style={{ fontSize: "0.62rem", marginTop: 8, display: "inline-block" }}>
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

/* ---- Theme toggle button ---- */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options: { value: "light" | "dark" | "system"; icon: string }[] = [
    { value: "light", icon: "\u2600\uFE0F" },
    { value: "dark", icon: "\u{1F319}" },
    { value: "system", icon: "\u{1F4BB}" },
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
  const [screen, setScreen] = useState<Screen>("chat");
  const [, forceRender] = useState(0);
  const [mascotVisible, setMascotVisible] = useState(() => {
    try { const v = localStorage.getItem("tokenfence-mascot"); return v !== "hidden"; } catch { return true; }
  });

  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  const toggleMascot = useCallback(() => {
    const next = !mascotVisible;
    setMascotVisible(next);
    try { localStorage.setItem("tokenfence-mascot", next ? "visible" : "hidden"); } catch {}
  }, [mascotVisible]);

  const currentContent = screen === "toolbox" ? <ToolboxScreen /> : screens[screen] ?? <ChatWorkspace />;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">TF</span>
          <span className="sidebar-brand-text">TokenFence</span>
        </div>
        <div className="sidebar-nav">
          {primaryNav.map(({ id, icon }) => (
            <button
              key={id}
              className={`sidebar-item ${screen === id ? "active" : ""}`}
              onClick={() => setScreen(id)}
              title={tk(screenLabels[id])}
            >
              <span className="sidebar-item-icon">{icon}</span>
              <span className="sidebar-item-label">{tk(screenLabels[id])}</span>
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
          <button
            onClick={toggleMascot}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "var(--tf-text-muted)", marginTop: 6,
              padding: "2px 4px"
            }}
            title={mascotVisible ? "Hide mascot" : "Show mascot"}
          >
            {mascotVisible ? "\u{1F441}\uFE0F} Hide mascot" : "\u{1F441}\uFE0F} Show mascot"}
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">{currentContent}</main>

      {/* Mascot */}
      <div
        className={`mascot ${mascotVisible ? "" : "hidden"}`}
        onClick={() => setScreen("chat")}
        title="Back to Chat"
      >
        <span style={{ fontSize: 48 }}>{String.fromCodePoint(0x1F916)}</span>
      </div>
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