import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
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

const primaryNav: { id: Screen; icon: string }[] = [
  { id: "chat", icon: "\u{1F4AC}" },
  { id: "projects", icon: "\u{1F4C1}" },
  { id: "models", icon: "\u{1F916}" },
  { id: "toolbox", icon: "\u{1F9F0}" },
  { id: "settings", icon: "\u2699\uFE0F" },
  { id: "about", icon: "\u2139\uFE0F" },
];

type ToolGroup = {
  labelKey: string;
  items: { id: Screen; labelKey: string; status: FeatureStatus }[];
};

const toolGroups: ToolGroup[] = [
  {
    labelKey: "common.security",
    items: [
      { id: "guard", labelKey: "nav.guard", status: "working" },
      { id: "routing", labelKey: "nav.routing", status: "working" },
    ],
  },
  {
    labelKey: "common.documents",
    items: [
      { id: "documents", labelKey: "nav.documents", status: "preview" },
      { id: "output", labelKey: "nav.outputs", status: "preview" },
    ],
  },
  {
    labelKey: "common.knowledge",
    items: [
      { id: "storage", labelKey: "nav.storage", status: "preview" },
      { id: "archive", labelKey: "nav.archive", status: "coming_soon" },
    ],
  },
  {
    labelKey: "common.agent",
    items: [
      { id: "agent-lab", labelKey: "nav.agentLab", status: "preview" },
      { id: "computer", labelKey: "nav.computerUse", status: "needs_runtime" },
      { id: "plugins", labelKey: "nav.plugins", status: "preview" },
    ],
  },
  {
    labelKey: "common.creative",
    items: [
      { id: "mindmap", labelKey: "nav.mindMap", status: "preview" },
      { id: "dashboard", labelKey: "nav.dashboard", status: "working" },
      { id: "matrix", labelKey: "nav.matrix", status: "preview" },
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

function ToolboxScreen() {
  const [activeTool, setActiveTool] = useState<Screen | null>(null);
  if (activeTool && screens[activeTool]) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setActiveTool(null)} className="btn btn-ghost" style={{ fontSize: 12 }}>{"\u2190"} {tk("actions.back")}</button>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{tk(screenLabels[activeTool])}</span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{screens[activeTool]}</div>
      </div>
    );
  }
  return (
    <div style={{ padding: "28px 32px" }}>
      <h2 className="page-title">{tk("common.toolbox")}</h2>
      <p className="page-subtitle">Tools and utilities — status labels show what is ready.</p>
      {toolGroups.map((group) => (
        <div key={group.labelKey} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase" }}>{tk(group.labelKey)}</h3>
          <div className="stats-grid">
            {group.items.map((item) => {
              const badge = statusBadge(item.status);
              return (
                <div key={item.id} className="stat-card" style={{ cursor: "pointer" }} onClick={() => setActiveTool(item.id)}>
                  <div className="stat-label">{tk(item.labelKey)}</div>
                  <span className={`badge ${badge.className}`} style={{ fontSize: "0.65rem", marginTop: 6, display: "inline-block" }}>{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>("chat");
  const [, forceRender] = useState(0);

  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">TF</span>
          <span className="sidebar-brand-text">TokenFence</span>
        </div>
        <div className="sidebar-nav">
          {primaryNav.map(({ id, icon }) => (
            <button key={id} className={`sidebar-item ${screen === id ? "active" : ""}`}
              onClick={() => setScreen(id)}>
              <span className="sidebar-item-icon">{icon}</span>
              <span className="sidebar-item-label">{tk(screenLabels[id])}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <div className="status-indicator" style={{ marginTop: 8 }}>
            <span className="status-dot green"></span>
            <span>{tk("status.localFirst")}</span>
          </div>
          <div className="version-text">v1.0.5</div>
        </div>
      </nav>
      <main className="main-content" style={{ padding: 0 }}>
        {screens[screen] ?? <ChatWorkspace />}
      </main>
    </div>
  );
}
