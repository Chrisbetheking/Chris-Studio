import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import {
  PROVIDERS,
  PROVIDER_ENDPOINTS,
  loadProviderConfigs,
  saveProviderConfigs,
  healthCheckProvider,
} from "@tokenfence/shared/src/providers";
import type { ProviderConfig } from "@tokenfence/shared/src/providers";

async function fetchProviderModels(provider: string, apiKey: string, baseUrl?: string): Promise<{ id: string }[]> {
  try {
    const ep = PROVIDER_ENDPOINTS[provider];
    if (!ep) return [];
    const modelsUrl = baseUrl ? `${baseUrl}/models` : `${ep.baseUrl}/models`;
    const resp = await fetch(modelsUrl, {
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const models = data?.data ?? data?.models ?? data ?? [];
    return Array.isArray(models) ? models.map((m: any) => ({ id: m.id ?? m.name ?? m.model })) : [];
  } catch {
    return [];
  }
}

function healthLabel(status?: string): string {
  switch (status) {
    case "ok": return tk("status.healthy");
    case "degraded": return tk("status.degraded");
    case "error": return tk("status.failed");
    default: return tk("common.unknown");
  }
}

function healthBadge(status?: string): string {
  switch (status) {
    case "ok": return "badge-green";
    case "degraded": return "badge-amber";
    case "error": return "badge-red";
    default: return "badge-muted";
  }
}

export function ProvidersScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);

  const [configs, setConfigs] = useState<ProviderConfig[]>(loadProviderConfigs());
  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  const updateConfig = useCallback((provider: string, updates: Partial<ProviderConfig>) => {
    setConfigs((prev) => {
      const next = prev.map((c) => (c.provider === provider ? { ...c, ...updates } : c));
      saveProviderConfigs(next);
      return next;
    });
  }, []);

  const runHealthCheck = useCallback(async (provider: string) => {
    setTestingId(provider);
    const config = configs.find((c) => c.provider === provider);
    if (!config) return;
    const result = await healthCheckProvider(config);
    setConfigs((prev) => {
      const next = prev.map((c) => (c.provider === provider ? result : c));
      saveProviderConfigs(next);
      return next;
    });
    setTestingId(null);
  }, [configs]);

  const runAllHealthChecks = useCallback(async () => {
    for (const c of configs.filter((c) => c.enabled)) {
      setTestingId(c.provider);
      const result = await healthCheckProvider(c);
      setConfigs((prev) => {
        const next = prev.map((p) => (p.provider === c.provider ? result : p));
        saveProviderConfigs(next);
        return next;
      });
    }
    setTestingId(null);
  }, [configs]);

  const refreshModelsFromProvider = useCallback(async (provider: string) => {
    const cfg = configs.find((c) => c.provider === provider);
    if (!cfg || !cfg.apiKey) {
      setRefreshMsg(tk("providersPage.noKeyForRefresh"));
      return;
    }
    setTestingId(provider);
    const models = await fetchProviderModels(provider, cfg.apiKey, cfg.baseUrl);
    if (models.length > 0) {
      setRefreshMsg(tk("providersPage.refreshedModels").replace("{count}", String(models.length)).replace("{provider}", provider));
    } else {
      setRefreshMsg(tk("providersPage.noModelsFound"));
    }
    setTestingId(null);
  }, [configs]);

  const editingConfig = editingProvider ? configs.find((c) => c.provider === editingProvider) : null;

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>{tk("providersPage.title")}</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>{tk("providersPage.subtitle")}</p>
      </div>

      {refreshMsg && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 16, background: "var(--surface-alt)", fontSize: "0.82rem", color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>{refreshMsg}</span>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.9rem" }} onClick={() => setRefreshMsg(null)}>&times;</button>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={runAllHealthChecks} style={{ fontSize: "0.82rem" }}>{tk("providersPage.runAllHC")}</button>
        <button className="btn btn-secondary" onClick={() => { for (const c of configs.filter((c) => c.enabled && c.apiKey)) refreshModelsFromProvider(c.provider); }} style={{ fontSize: "0.82rem" }}>{tk("providersPage.refreshModels")}</button>
        <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
          <span className="badge badge-green" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>{configs.filter((c) => c.enabled).length} {tk("providersPage.enabledCount")}</span>
          <span className="badge badge-blue" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>{configs.filter((c) => c.lastHealthStatus === "ok").length} {tk("providersPage.healthyCount")}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{configs.length} {tk("providersPage.enabledCount") === "enabled" ? "providers" : tk("providersPage.enabledCount")}</span>
        </div>
      </div>

      {/* Provider cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {configs.map((config) => {
          const testing = testingId === config.provider;
          const configured = !!config.apiKey;
          return (
            <div key={config.provider} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: configured ? "var(--primary)" : "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", color: configured ? "white" : "var(--text-muted)", flexShrink: 0, fontWeight: 600 }}>
                  {config.provider.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>{config.provider}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                    <span className={`badge ${config.deployment === "local" ? "badge-green" : "badge-blue"}`} style={{ fontSize: "0.68rem" }}>
                      {config.deployment === "local" ? tk("providers.local") : tk("providers.cloud")}
                    </span>
                    <span className={`badge ${healthBadge(config.lastHealthStatus)}`} style={{ fontSize: "0.68rem" }}>
                      {healthLabel(config.lastHealthStatus)}
                    </span>
                    <span className={`badge ${config.enabled ? "badge-green" : "badge-muted"}`} style={{ fontSize: "0.68rem" }}>
                      {config.enabled ? tk("status.enabled") : tk("status.disabled")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Model summary */}
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-muted)" }}>{tk("providers.model")}:</span>{" "}
                <span style={{ fontWeight: 500, color: "var(--text)" }}>{config.model || tk("providers.noModel")}</span>
                {config.customModelId && (
                  <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace" }}>({config.customModelId})</span>
                )}
              </div>

              {/* Last check info */}
              {config.lastHealthCheck && (
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {tk("providers.lastCheck")}: {new Date(config.lastHealthCheck).toLocaleString()}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <button className="btn btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 14px" }} disabled={testing} onClick={() => runHealthCheck(config.provider)}>
                  {testing ? tk("providers.testing") : tk("providers.healthCheck")}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "5px 14px" }} onClick={() => setEditingProvider(config.provider)}>
                  {tk("providers.editProvider")}
                </button>
                {config.apiKey && (
                  <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "5px 14px" }} disabled={testing} onClick={() => refreshModelsFromProvider(config.provider)}>
                    {tk("providersPage.refreshModels")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingProvider && editingConfig && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setEditingProvider(null)}>
          <div className="card" style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 60px rgba(0,0,0,0.3)", animation: "modalIn 0.2s ease" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--text)" }}>{tk("providers.editProvider")}: {editingConfig.provider}</h3>
              <button onClick={() => setEditingProvider(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.3rem", padding: "4px 8px" }}>&times;</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providers.model")}</label>
                <input className="input" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.85rem" }} value={editingConfig.model} onChange={(e) => updateConfig(editingConfig.provider, { model: e.target.value })} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providers.baseUrl")}</label>
                <input className="input" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.8rem", fontFamily: "monospace" }} value={editingConfig.baseUrl} onChange={(e) => updateConfig(editingConfig.provider, { baseUrl: e.target.value })} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providers.apiKey")}</label>
                <input className="input" type="password" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.8rem", fontFamily: "monospace" }} value={editingConfig.apiKey} onChange={(e) => updateConfig(editingConfig.provider, { apiKey: e.target.value })} placeholder={editingConfig.deployment === "local" ? tk("common.none") : "sk-..."} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providersPage.customModelHint")}</label>
                <input className="input" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.8rem" }} value={editingConfig.customModelId ?? ""} onChange={(e) => updateConfig(editingConfig.provider, { customModelId: e.target.value || undefined })} placeholder={tk("common.none")} />
              </div>
              {editingConfig.lastHealthError && (
                <div style={{ color: "var(--red)", fontSize: "0.8rem", padding: "8px 12px", background: "rgba(255,0,0,0.05)", borderRadius: 8 }}>{tk("common.error")}: {editingConfig.lastHealthError}</div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setEditingProvider(null)}>{tk("actions.close")}</button>
                <button className="btn btn-primary" onClick={() => { runHealthCheck(editingConfig.provider); }} disabled={testing}>{testing ? tk("providers.testing") : tk("providers.healthCheck")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
