import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { useTheme } from "../components/ThemeProvider";
import { PROVIDERS, PROVIDER_ENDPOINTS, type ProviderConfig,
  loadProviderConfigs, saveProviderConfigs, healthCheckProvider,
} from "@tokenfence/shared/src/providers";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";

const SETTINGS_KEY = "tokenfence-settings";

interface AppSettings {
  language: string;
  theme: "light" | "dark";
  defaultPage: string;
  localFirst: boolean;
  redactBeforeSend: boolean;
  saveConversations: boolean;
}

function loadSettings(): AppSettings {
  try { const r = storeGet(SETTINGS_KEY); return r ? JSON.parse(r) : defaultSettings(); }
  catch { return defaultSettings(); }
}

function defaultSettings(): AppSettings {
  return { language: "en", theme: "light", defaultPage: "chat", localFirst: true, redactBeforeSend: false, saveConversations: true };
}

function saveSettings(s: AppSettings) { storeSet(SETTINGS_KEY, JSON.stringify(s)); }

export function SettingsScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);


  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [activeSection, setActiveSection] = useState("general");
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>(() => loadProviderConfigs());
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editModel, setEditModel] = useState("");
  const { theme, setTheme } = useTheme();

  const [updateStatus, setUpdateStatus] = useState("");
  const isZh = tk("common.yes") !== "Yes";

  const handleExportSettings = () => {
    try {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("tokenfence")) {
          data[key] = localStorage.getItem(key) || "";
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "tokenfence-settings-backup.json"; a.click();
      URL.revokeObjectURL(url);
      setUpdateStatus(isZh ? "导出成功" : "Exported successfully");
    } catch (e: any) {
      setUpdateStatus(`${isZh ? "导出失败" : "Export failed"}: ${e.message}`);
    }
  };

  const handleImportSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith("tokenfence")) {
            localStorage.setItem(key, value as string);
          }
        }
        setUpdateStatus(isZh ? "导入成功，请刷新页面" : "Imported successfully. Please refresh.");
      } catch (ex: any) {
        setUpdateStatus(`${isZh ? "导入失败" : "Import failed"}: ${ex.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleCheckUpdates = async () => {
    setUpdateStatus(isZh ? "正在检查..." : "Checking...");
    try {
      const resp = await fetch("https://api.github.com/repos/Chrisbetheking/tokenfence-studio/releases/latest");
      const data = await resp.json();
      const latest = data.tag_name || "";
      setUpdateStatus(`${isZh ? "最新版本" : "Latest"}: ${latest} ${latest === "v1.1.0" ? "✅" : ""}`);
    } catch {
      setUpdateStatus(isZh ? "无法检查更新" : "Unable to check for updates");
    }
  };

  const handleOpenLogs = async () => {
    try {
      const { openLogsFolder } = await import("../desktop-bridge");
      await openLogsFolder();
      setUpdateStatus(isZh ? "已打开日志文件夹" : "Logs folder opened");
    } catch {
      setUpdateStatus(isZh ? "无法打开日志文件夹" : "Cannot open logs folder");
    }
  };


  const sections = [
    { id: "general", label: tk("settings.general") },
    { id: "providers", label: tk("settings.providers") },
    { id: "routing", label: tk("settings.modelRouting") },
    { id: "privacy", label: tk("settings.privacy") },
    { id: "maintenance", label: tk("settings.maintenance") || "Maintenance" },
  ];

  const saveSetting = useCallback((key: keyof AppSettings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated); saveSettings(updated);
  }, [settings]);

  const openProviderEdit = useCallback((providerId: string) => {
    const cfg = providerConfigs.find(c => c.provider === providerId);
    setEditingProvider(providerId);
    setEditKey(cfg?.apiKey ?? "");
    setEditUrl(cfg?.baseUrl ?? PROVIDER_ENDPOINTS[providerId]?.baseUrl ?? "");
    setEditModel(cfg?.model ?? "");
  }, [providerConfigs]);

  const saveProviderConfig = useCallback(() => {
    if (!editingProvider) return;
    const updated = providerConfigs.map(c => {
      if (c.provider !== editingProvider) return c;
      return { ...c, apiKey: editKey, baseUrl: editUrl, model: editModel, enabled: !!editKey };
    });
    setProviderConfigs(updated); saveProviderConfigs(updated);
    setEditingProvider(null);
  }, [editingProvider, editKey, editUrl, editModel, providerConfigs]);

  const testConnection = useCallback(async (providerId: string) => {
    const cfg = providerConfigs.find(c => c.provider === providerId);
    if (!cfg) return;
    setTestStatus(p => ({ ...p, [providerId]: "testing" }));
    try {
      const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/tauri");
        const result: any = await invoke("test_provider_connection", {
          providerId, baseUrl: editUrl || cfg.baseUrl, apiKey: editKey || cfg.apiKey || null,
        });
        setTestStatus(p => ({ ...p, [providerId]: result.status }));
        const updated = providerConfigs.map(c => c.provider === providerId ? { ...c, lastHealthStatus: result.status, lastHealthError: result.message, enabled: result.ok } : c);
        setProviderConfigs(updated); saveProviderConfigs(updated);
      } else {
        const result = await healthCheckProvider({ ...cfg, apiKey: editKey || cfg.apiKey });
        setTestStatus(p => ({ ...p, [providerId]: result.lastHealthStatus ?? "unknown" }));
        const updated = providerConfigs.map(c => c.provider === providerId ? { ...c, ...result } : c);
        setProviderConfigs(updated); saveProviderConfigs(updated);
      }
    } catch (e: any) {
      setTestStatus(p => ({ ...p, [providerId]: "failed" }));
    }
  }, [providerConfigs, editKey, editUrl]);

  const resetLocalData = useCallback(() => {
    if (confirm(tk("settings.resetWarning"))) {
      storeSet("tokenfence-conversations", "");
      storeSet("tokenfence-projects", "");
      storeSet("tokenfence-provider-configs", "");
      storeSet(SETTINGS_KEY, "");
      setSettings(defaultSettings());
      setProviderConfigs(loadProviderConfigs());
    }
  }, []);

  const statusColor = (s: string) => {
    if (s === "ok") return "var(--tf-success)";
    if (s === "testing") return "var(--tf-warning)";
    if (s === "failed" || s === "degraded") return "var(--tf-danger)";
    return "var(--tf-text-muted)";
  };

  return (
    <div className="settings-layout">
      <div className="settings-sidebar">
        {sections.map(s => (
          <button key={s.id} className={`settings-sidebar-item ${activeSection === s.id ? "active" : ""}`}
            onClick={() => setActiveSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="settings-content">
        {activeSection === "general" && (
          <>
            <h1 className="page-title">{tk("settings.general")}</h1>
            <p className="page-subtitle">Application preferences and theme</p>

            <div className="tf-card">
              <div className="tf-card-title" style={{ marginBottom: 16 }}>{tk("settings.theme")}</div>
              <div className="theme-toggle-group">
                {(["light", "dark", "system"] as const).map(t => (
                  <button key={t} className={`theme-toggle-btn ${theme === t ? "active" : ""}`} onClick={() => setTheme(t)}>
                    {t === "light" ? "\u2600\uFE0F" : t === "dark" ? "\u{1F319}" : "\u{1F4BB}"} {tk(`settings.theme${t.charAt(0).toUpperCase() + t.slice(1) as any}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="tf-card" style={{ marginTop: 16 }}>
              <div className="tf-card-title" style={{ marginBottom: 12 }}>{tk("settings.language")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={`btn ${settings.language === "en" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => { saveSetting("language", "en"); window.location.reload(); }}>English</button>
                <button className={`btn ${settings.language === "zh-CN" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => { saveSetting("language", "zh-CN"); window.location.reload(); }}>中文</button>
              </div>
            </div>

            <div className="tf-card" style={{ marginTop: 16 }}>
              <div className="tf-card-title" style={{ marginBottom: 12 }}>{tk("settings.defaultPage")}</div>
              <select className="tf-select" value={settings.defaultPage} onChange={e => saveSetting("defaultPage", e.target.value)}>
                <option value="chat">{tk("nav.chat")}</option>
                <option value="projects">{tk("common.projects")}</option>
                <option value="models">{tk("common.models")}</option>
              </select>
            </div>
          </>
        )}

        {activeSection === "providers" && (
          <>
            <h1 className="page-title">{tk("settings.providers")}</h1>
            <p className="page-subtitle">Configure API keys and test connections</p>

            <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
              <span className="badge badge-green">{providerConfigs.filter(c => c.enabled).length} enabled</span>
              <span className="badge badge-blue">{providerConfigs.filter(c => c.lastHealthStatus === "ok").length} healthy</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {providerConfigs.map((p) => {
                const status = testStatus[p.provider] ?? p.lastHealthStatus ?? "unknown";
                const isEditing = editingProvider === p.provider;
                return (
                  <div key={p.provider} className="tf-card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: "0.9rem" }}>{p.provider}</strong>
                        <span className={`badge ${p.deployment === "local" ? "badge-green" : "badge-blue"}`}>
                          {p.deployment === "local" ? tk("providers.local") : tk("providers.cloud")}
                        </span>
                        {status !== "unknown" && (
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(status) }} />
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => testConnection(p.provider)} className="btn btn-ghost" style={{ fontSize: "0.7rem", padding: "4px 10px" }}>
                          {status === "testing" ? "\u23F3" : tk("providers.healthCheck")}
                        </button>
                        <button onClick={() => isEditing ? saveProviderConfig() : openProviderEdit(p.provider)}
                          className={`btn ${isEditing ? "btn-primary" : "btn-ghost"}`}
                          style={{ fontSize: "0.7rem", padding: "4px 10px" }}>
                          {isEditing ? tk("actions.save") : "\u270F\uFE0F"}
                        </button>
                      </div>
                    </div>
                    {status !== "unknown" && !isEditing && (
                      <div style={{ fontSize: "0.75rem", color: statusColor(status) }}>
                        {status === "ok" ? tk("status.connected") : status === "failed" ? tk("status.failed") : status}
                      </div>
                    )}
                    {isEditing && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        <input className="tf-input" value={editKey} onChange={e => setEditKey(e.target.value)} type="password" placeholder="API Key" />
                        <input className="tf-input" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="Base URL" />
                        <input className="tf-input" value={editModel} onChange={e => setEditModel(e.target.value)} placeholder="Default model" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeSection === "routing" && (
          <>
            <h1 className="page-title">{tk("settings.modelRouting")}</h1>
            <p className="page-subtitle">{tk("nav.routing")} configuration</p>
            <div className="tf-card">
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: "0.85rem", color: "var(--tf-text)", cursor: "pointer" }}>
                <input type="checkbox" checked={true} onChange={() => {}} />
                {tk("settings.autoSwitchDesc")}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: "0.85rem", color: "var(--tf-text)", cursor: "pointer" }}>
                <input type="checkbox" checked={false} onChange={() => {}} />
                {tk("settings.askBeforeSwitch")}
              </label>
              <div style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginTop: 16, borderTop: "1px solid var(--tf-border)", paddingTop: 12 }}>
                {tk("settings.routingRulesDesc")}
              </div>
            </div>
          </>
        )}

        {activeSection === "maintenance" && (
          <>
            <h1 className="page-title">{tk("settings.maintenance") || "Maintenance"}</h1>
            <div className="tf-card">
              {/* Export Settings */}
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--tf-border)" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--tf-text)", marginBottom: 4 }}>
                  {isZh ? "导出设置" : "Export Settings"}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginBottom: 8 }}>
                  {isZh ? "将所有设置导出为 JSON 文件" : "Export all settings as a JSON file"}
                </p>
                <button className="btn btn-secondary" style={{ fontSize: "0.78rem" }} onClick={handleExportSettings}>
                  {isZh ? "导出" : "Export"}
                </button>
              </div>

              {/* Import Settings */}
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--tf-border)" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--tf-text)", marginBottom: 4 }}>
                  {isZh ? "导入设置" : "Import Settings"}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginBottom: 8 }}>
                  {isZh ? "从 JSON 文件导入设置" : "Import settings from a JSON file"}
                </p>
                <input type="file" accept=".json" onChange={handleImportSettings} style={{ fontSize: "0.78rem" }} />
              </div>

              {/* Check for Updates */}
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--tf-border)" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--tf-text)", marginBottom: 4 }}>
                  {isZh ? "检查更新" : "Check for Updates"}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginBottom: 8 }}>
                  {isZh ? "查看最新版本" : "Check for the latest release"}
                </p>
                <button className="btn btn-secondary" style={{ fontSize: "0.78rem" }} onClick={handleCheckUpdates}>
                  {isZh ? "检查" : "Check"}
                </button>
                {updateStatus && (
                  <div style={{ marginTop: 8, fontSize: "0.75rem", color: updateStatus.includes("v1.1.0") ? "var(--tf-success)" : "var(--tf-warning)" }}>
                    {updateStatus}
                  </div>
                )}
              </div>

              {/* Open Logs */}
              <div style={{ padding: "12px 0" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--tf-text)", marginBottom: 4 }}>
                  {isZh ? "操作日志" : "Operation Logs"}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginBottom: 8 }}>
                  {isZh ? "打开本地日志文件夹" : "Open local logs folder"}
                </p>
                <button className="btn btn-secondary" style={{ fontSize: "0.78rem" }} onClick={handleOpenLogs}>
                  {isZh ? "打开日志文件夹" : "Open Logs Folder"}
                </button>
              </div>
            </div>
          </>
        )}

        {activeSection === "privacy" && (
          <>
            <h1 className="page-title">{tk("settings.privacy")}</h1>
            <div className="tf-card">
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", cursor: "pointer" }}>
                <span style={{ color: "var(--tf-text)", fontSize: "0.85rem" }}>{tk("settings.localFirstMode")}</span>
                <input type="checkbox" checked={settings.localFirst} onChange={e => saveSetting("localFirst", e.target.checked)} />
              </label>
              <hr className="tf-divider" />
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", cursor: "pointer" }}>
                <span style={{ color: "var(--tf-text)", fontSize: "0.85rem" }}>{tk("settings.redactBeforeSend")}</span>
                <input type="checkbox" checked={settings.redactBeforeSend} onChange={e => saveSetting("redactBeforeSend", e.target.checked)} />
              </label>
              <hr className="tf-divider" />
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", cursor: "pointer" }}>
                <span style={{ color: "var(--tf-text)", fontSize: "0.85rem" }}>{tk("settings.saveConversations")}</span>
                <input type="checkbox" checked={settings.saveConversations} onChange={e => saveSetting("saveConversations", e.target.checked)} />
              </label>
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--tf-border)" }}>
                <button
                  onClick={() => { storeSet("tokenfence-conversations", ""); alert(tk("settings.conversationsCleared")); }}
                  className="btn btn-ghost" style={{ color: "var(--tf-danger)", fontSize: "0.8rem" }}>
                  {tk("settings.clearConversations")}
                </button>
                <button onClick={resetLocalData} className="btn btn-danger" style={{ fontSize: "0.8rem", marginLeft: 12 }}>
                  {tk("settings.resetData")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}