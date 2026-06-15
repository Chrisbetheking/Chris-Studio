import { useState, useEffect, useCallback } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
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
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [activeSection, setActiveSection] = useState("general");
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>(() => loadProviderConfigs());
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editModel, setEditModel] = useState("");

  const sections = [
    { id: "general", label: "General" },
    { id: "providers", label: "Providers" },
    { id: "routing", label: "Model Routing" },
    { id: "privacy", label: "Privacy" },
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
      const result = await healthCheckProvider({ ...cfg, apiKey: editKey || cfg.apiKey });
      setTestStatus(p => ({ ...p, [providerId]: result.lastHealthStatus ?? "unknown" }));
      // Update config with health status
      const updated = providerConfigs.map(c => c.provider === providerId ? { ...c, ...result } : c);
      setProviderConfigs(updated); saveProviderConfigs(updated);
    } catch {
      setTestStatus(p => ({ ...p, [providerId]: "failed" }));
    }
  }, [providerConfigs, editKey]);

  const resetLocalData = useCallback(() => {
    if (confirm("Reset all local data? This cannot be undone.")) {
      storeSet("tokenfence-conversations", "");
      storeSet("tokenfence-projects", "");
      storeSet("tokenfence-provider-configs", "");
      storeSet(SETTINGS_KEY, "");
      setSettings(defaultSettings());
      setProviderConfigs(loadProviderConfigs());
    }
  }, []);

  const statusColor = (s: string) => {
    if (s === "ok") return "var(--green)";
    if (s === "testing") return "var(--amber)";
    if (s === "failed" || s === "degraded") return "var(--red)";
    return "var(--text-muted)";
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Section tabs */}
      <div style={{ width: 180, borderRight: "1px solid var(--border)", padding: "16px 8px", background: "var(--surface)" }}>
        {sections.map(s => (
          <div key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: "0.85rem",
              color: activeSection === s.id ? "var(--text)" : "var(--text-muted)",
              background: activeSection === s.id ? "var(--surface-alt)" : "transparent",
              fontWeight: activeSection === s.id ? 600 : 400, marginBottom: 2 }}>
            {s.label}
          </div>
        ))}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
          v1.0.5
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
        {activeSection === "general" && (
          <>
            <h2 className="page-title">General</h2>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>Theme</div>
                <select value={settings.theme} onChange={e => saveSetting("theme", e.target.value)}
                  style={{ background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem" }}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>Default Page</div>
                <select value={settings.defaultPage} onChange={e => saveSetting("defaultPage", e.target.value)}
                  style={{ background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem" }}>
                  <option value="chat">Chat</option>
                  <option value="projects">Projects</option>
                  <option value="models">Models</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Version: <strong>1.0.5</strong></div>
              </div>
              <button onClick={resetLocalData} className="btn btn-ghost" style={{ color: "var(--red)", fontSize: "0.8rem" }}>
                Reset all local data
              </button>
            </div>
          </>
        )}

        {activeSection === "providers" && (
          <>
            <h2 className="page-title">Providers</h2>
            <p className="page-subtitle">Configure API keys and endpoints for each provider.</p>
            {PROVIDERS.map(p => {
              const cfg = providerConfigs.find(c => c.provider === p.provider);
              const isEditing = editingProvider === p.provider;
              const status = testStatus[p.provider] || cfg?.lastHealthStatus || "unknown";
              const configured = !!(cfg?.apiKey);
              return (
                <div key={p.provider} className="card" style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: configured ? "var(--green)" : "var(--text-muted)" }}></span>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>{p.provider}</span>
                      <span className={`badge ${configured ? "badge-green" : "badge-slate"}`} style={{ fontSize: "0.65rem" }}>
                        {configured ? "Configured" : "Not configured"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => testConnection(p.provider)} className="btn btn-ghost" style={{ fontSize: "0.7rem", padding: "4px 10px" }}>
                        {status === "testing" ? "..." : "Test"}
                      </button>
                      <button onClick={() => isEditing ? saveProviderConfig() : openProviderEdit(p.provider)} className={`btn ${isEditing ? "btn-primary" : "btn-ghost"}`}
                        style={{ fontSize: "0.7rem", padding: "4px 10px" }}>
                        {isEditing ? "Save" : "Edit"}
                      </button>
                    </div>
                  </div>
                  {status !== "unknown" && !isEditing && (
                    <div style={{ marginTop: 8, fontSize: "0.7rem", color: statusColor(status) }}>
                      Status: {status}
                    </div>
                  )}
                  {isEditing && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <input value={editKey} onChange={e => setEditKey(e.target.value)} type="password" placeholder="API Key"
                        style={{ background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.8rem", outline: "none" }} />
                      <input value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="Base URL"
                        style={{ background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.8rem", outline: "none" }} />
                      <input value={editModel} onChange={e => setEditModel(e.target.value)} placeholder="Default model"
                        style={{ background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.8rem", outline: "none" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {activeSection === "routing" && (
          <>
            <h2 className="page-title">Model Routing</h2>
            <p className="page-subtitle">Configure file-type based auto-routing.</p>
            <div className="card">
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "var(--text)" }}>
                  <input type="checkbox" checked={true} onChange={() => {}} />
                  Auto-switch model on file attach
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "var(--text)" }}>
                  <input type="checkbox" checked={false} onChange={() => {}} />
                  Ask before switching
                </label>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 16 }}>
                Routing rules are configured in the Model Registry. Code files → coding models, PDF/images → vision models, etc.
              </div>
            </div>
          </>
        )}

        {activeSection === "privacy" && (
          <>
            <h2 className="page-title">Privacy</h2>
            <div className="card">
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text)" }}>Local-first mode</span>
                <input type="checkbox" checked={settings.localFirst} onChange={e => saveSetting("localFirst", e.target.checked)} />
              </label>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text)" }}>Redact sensitive data before sending</span>
                <input type="checkbox" checked={settings.redactBeforeSend} onChange={e => saveSetting("redactBeforeSend", e.target.checked)} />
              </label>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text)" }}>Save conversations locally</span>
                <input type="checkbox" checked={settings.saveConversations} onChange={e => saveSetting("saveConversations", e.target.checked)} />
              </label>
              <div style={{ marginTop: 16 }}>
                <button onClick={() => { storeSet("tokenfence-conversations", ""); alert("Conversations cleared"); }}
                  className="btn btn-ghost" style={{ color: "var(--red)", fontSize: "0.8rem" }}>
                  Clear all conversations
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
