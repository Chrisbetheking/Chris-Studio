import { useState, useEffect, useMemo, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import {
  MODEL_REGISTRY, getModelsForProvider, getProviderIds,
  type ModelRegistryItem, type ModelCapability,
} from "@tokenfence/shared/src/model-registry";
import {
  loadInstalledModels, installModel, uninstallModel,
  toggleModel, setDefaultModel, updateModelAlias, markModelUsed,
  type InstalledModel,
} from "@tokenfence/shared/src/installed-models";
import {
  PROVIDERS, PROVIDER_ENDPOINTS, loadProviderConfigs, saveProviderConfigs,
  healthCheckProvider, type ProviderConfig,
} from "@tokenfence/shared/src/providers";
import { ROUTING_RULES, findRoutingRule, type RoutingRule } from "@tokenfence/shared/src/model-registry";
import { CustomModelModal } from "../components/CustomModelModal";
import { ProviderConfigModal } from "../components/ProviderConfigModal";
import { ProviderSetupWizard } from "../components/ProviderSetupWizard";
import { runProviderHealthCheck, saveHealthResult, loadHealthResults, loadCustomModels, removeCustomModel, type HealthResult } from "../data/active-model";
import { ModelRuntimeSelfTest } from "../components/ModelRuntimeSelfTest";

/* ============================================================
   Provider Config helpers (from ProvidersScreen)
   ============================================================ */
const STORAGE_KEY = "tokenfence-provider-configs";

function persistConfigs(configs: ProviderConfig[]) {
  try { saveProviderConfigs(configs); } catch {}
}

function getHealthBadge(status?: string): string {
  switch (status) { case "ok": return "badge-green"; case "degraded": return "badge-amber"; case "failed": case "error": return "badge-red"; case "not_configured": return "badge-muted"; default: return "badge-muted"; }
}

function getHealthLabel(status?: string): string {
  switch (status) { case "ok": return tk("status.healthy"); case "degraded": return tk("status.degraded"); case "failed": case "error": return tk("status.failed"); case "not_configured": return tk("status.notConfigured") || "Not configured"; default: return tk("common.unknown"); }
}

/* ============================================================
   ModelsScreen — 4 Tabs
   ============================================================ */
type ModelsTab = "installed" | "library" | "providers" | "routing" | "selftest";

const tabDefs: { id: ModelsTab; labelKeyEn: string; labelKeyZh: string }[] = [
  { id: "installed", labelKeyEn: "Installed Models", labelKeyZh: "\u5DF2\u6DFB\u52A0\u6A21\u578B" },
  { id: "library", labelKeyEn: "Model Library", labelKeyZh: "\u6A21\u578B\u5E93" },
  { id: "providers", labelKeyEn: "Providers", labelKeyZh: "\u63D0\u4F9B\u5546" },
  { id: "routing", labelKeyEn: "Routing", labelKeyZh: "\u8DEF\u7531" },
  { id: "selftest", labelKeyEn: "Self Test", labelKeyZh: "\u81EA\u68C0" },
];

export function ModelsScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);

  const [activeTab, setActiveTab] = useState<ModelsTab>("installed");
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>(() => loadInstalledModels());
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>(() => loadProviderConfigs());
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProviderConfig>>({});
  const [fetchingProvider, setFetchingProvider] = useState<string | null>(null);
  const [showCustomModelModal, setShowCustomModelModal] = useState(false);
  const [showProviderConfigModal, setShowProviderConfigModal] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [configTargetProvider, setConfigTargetProvider] = useState<string | undefined>(undefined);
  const [healthResults, setHealthResults] = useState<Record<string, HealthResult>>(() => loadHealthResults());
  const [customModels, setCustomModels] = useState(() => loadCustomModels());
  const [fetchedModels, setFetchedModels] = useState<{id:string}[]>([]);

  const isZh = tk("app.title") !== "TokenFence Studio" || tk("common.yes") !== "Yes";

  const refreshInstalled = useCallback(() => {
    setInstalledModels(loadInstalledModels());
  }, []);

  const handleInstall = (providerId: string, modelId: string, source: "registry" | "fetched" = "registry") => {
    installModel(providerId, modelId, source);
    refreshInstalled();
  };

  const handleUninstall = (id: string) => {
    uninstallModel(id);
    refreshInstalled();
  };

  const handleToggle = (id: string) => {
    toggleModel(id);
    refreshInstalled();
  };

  const handleSetDefault = (id: string) => {
    setDefaultModel(id);
    refreshInstalled();
  };

  const startEditAlias = (m: InstalledModel) => {
    setEditingAliasId(m.id);
    setAliasText(m.alias ?? "");
  };

  const saveAlias = (id: string) => {
    updateModelAlias(id, aliasText.trim());
    setEditingAliasId(null);
    refreshInstalled();
  };

  // Provider config handlers
  const updateConfig = (provider: string, updates: Partial<ProviderConfig>) => {
    const configs = [...providerConfigs];
    const idx = configs.findIndex((c) => c.provider === provider);
    if (idx >= 0) {
      configs[idx] = { ...configs[idx], ...updates };
      setProviderConfigs(configs);
      persistConfigs(configs);
      setEditForm((prev) => ({ ...prev, ...updates }));
    }
  };

  const runHealthCheck = async (provider: string) => {
    setTestingId(provider);
    try {
      const configs = [...providerConfigs];
      const idx = configs.findIndex((c) => c.provider === provider);
      if (idx >= 0) {
        const result = await runProviderHealthCheck(configs[idx]);
        configs[idx] = { ...configs[idx], lastHealthCheck: Date.now(), lastHealthStatus: result.status === "ok" ? "ok" : "failed", lastHealthError: result.error };
        saveHealthResult(provider, result);
        setHealthResults((prev) => ({ ...prev, [provider]: result }));
        setProviderConfigs(configs);
        persistConfigs(configs);
      }
    } catch {}
    setTestingId(null);
  };

  const fetchModels = async (provider: string) => {
    setFetchingProvider(provider);
    setFetchedModels([]);
    const cfg = providerConfigs.find((c) => c.provider === provider);
    if (!cfg?.apiKey) { setFetchingProvider(null); return; }
    try {
      const ep = PROVIDER_ENDPOINTS[provider];
      if (!ep) { setFetchingProvider(null); return; }
      const modelsUrl = `${ep.baseUrl}${ep.modelsEndpoint}`;
      const resp = await fetch(modelsUrl, {
        headers: { "Authorization": `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      });
      if (!resp.ok) { setFetchingProvider(null); return; }
      const data = await resp.json();
      const models = data?.data ?? data?.models ?? data ?? [];
      setFetchedModels(Array.isArray(models) ? models.map((m: any) => ({ id: m.id ?? m.name ?? m.model })) : []);
    } catch {}
    setFetchingProvider(null);
  };

  const isConfigured = (pid: string) => {
    const cfg = providerConfigs.find((c) => c.provider === pid);
    return !!(cfg?.apiKey);
  };

  const getTabLabel = (tab: ModelsTab) => {
    const def = tabDefs.find((t) => t.id === tab)!;
    return isZh ? def.labelKeyZh : def.labelKeyEn;
  };

  // Get provider group for registry
  const providerGroups = useMemo(() => {
    const ids = getProviderIds();
    return ids.filter((pid) => getModelsForProvider(pid).length > 0);
  }, []);

  // Group installed models by provider
  const installedByProvider = useMemo(() => {
    const groups: Record<string, InstalledModel[]> = {};
    for (const m of installedModels) {
      if (!groups[m.providerId]) groups[m.providerId] = [];
      groups[m.providerId].push(m);
    }
    return groups;
  }, [installedModels]);

  const isInstalled = (providerId: string, modelId: string) => {
    return installedModels.some((m) => m.providerId === providerId && m.modelId === modelId);
  };

  /* ============================================================
     Render Tab Content
     ============================================================ */

  const renderInstalledModels = () => (
    <div style={{ padding: 16 }}>
      {installedModels.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>{"\u{1F916}"}</div>
          <div style={{ fontSize: "1rem", fontWeight: 500, marginBottom: 8 }}>{tk("modelsPage.noInstalledModels")}</div>
          <div style={{ fontSize: "0.8rem", marginBottom: 20 }}>{tk("modelsPage.goToLibrary")}</div>
          <button className="btn btn-primary" onClick={() => setActiveTab("library")}>
            {getTabLabel("library")}
          </button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge badge-green" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>
              {installedModels.filter((m) => m.enabled).length} {isZh ? "\u5DF2\u542F\u7528" : "enabled"}
            </span>
            <span className="badge badge-blue" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>
              {Object.keys(installedByProvider).length} {isZh ? "\u63D0\u4F9B\u5546" : "providers"}
            </span>
          </div>

          {/* Models grid grouped by provider */}
          {Object.entries(installedByProvider).map(([providerId, models]) => (
            <div key={providerId} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", color: "white", fontWeight: 700 }}>
                  {providerId.slice(0, 2).toUpperCase()}
                </span>
                {providerId}
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400 }}>({models.length})</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
                {models.map((m) => {
                  const reg = MODEL_REGISTRY.find((r) => r.providerId === m.providerId && r.modelId === m.modelId);
                  const caps = (reg?.capabilities ?? []).slice(0, 3);
                  return (
                    <div key={m.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, opacity: m.enabled ? 1 : 0.55 }}>
                      {/* Top row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)", flex: 1 }}>{m.displayName}</span>
                        {m.isDefault && <span className="badge badge-blue" style={{ fontSize: "0.62rem" }}>{isZh ? "\u9ED8\u8BA4" : "Default"}</span>}
                        {m.enabled ? (
                          <span className="badge badge-green" style={{ fontSize: "0.62rem" }}>{isZh ? "\u5DF2\u542F\u7528" : "Enabled"}</span>
                        ) : (
                          <span className="badge badge-muted" style={{ fontSize: "0.62rem" }}>{isZh ? "\u5DF2\u7981\u7528" : "Disabled"}</span>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        <span style={{ fontFamily: "monospace" }}>{m.modelId}</span>
                        {m.alias && <span style={{ marginLeft: 6, color: "var(--text-secondary)" }}>({m.alias})</span>}
                        {caps.length > 0 && (
                          <span style={{ marginLeft: 8 }}>
                            {caps.map((c) => (
                              <span key={c} className="badge badge-slate" style={{ fontSize: "0.6rem", marginRight: 3, padding: "1px 5px" }}>{c}</span>
                            ))}
                          </span>
                        )}
                        {reg?.contextWindow && (
                          <span style={{ marginLeft: 6, fontSize: "0.62rem" }}>
                            {reg.contextWindow >= 1000000 ? (reg.contextWindow / 1000000).toFixed(1) + "M" : (reg.contextWindow / 1000).toFixed(0) + "K"}
                          </span>
                        )}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => handleToggle(m.id)}>
                          {m.enabled ? (isZh ? "\u7981\u7528" : "Disable") : (isZh ? "\u542F\u7528" : "Enable")}
                        </button>
                        {!m.isDefault && m.enabled && (
                          <button className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => handleSetDefault(m.id)}>
                            {isZh ? "\u8BBE\u4E3A\u9ED8\u8BA4" : "Set Default"}
                          </button>
                        )}
                        <button className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => startEditAlias(m)}>
                          {isZh ? "\u7F16\u8F91\u522B\u540D" : "Edit Alias"}
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "3px 8px", color: "var(--red)" }} onClick={() => handleUninstall(m.id)}>
                          {isZh ? "\u79FB\u9664" : "Remove"}
                        </button>
                      </div>
                      {/* Edit alias inline */}
                      {editingAliasId === m.id && (
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <input className="input" style={{ flex: 1, fontSize: "0.75rem", padding: "4px 8px" }} value={aliasText} onChange={(e) => setAliasText(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveAlias(m.id); if (e.key === "Escape") setEditingAliasId(null); }} />
                          <button className="btn btn-primary" style={{ fontSize: "0.7rem", padding: "4px 10px" }} onClick={() => saveAlias(m.id)}>{isZh ? "\u4FDD\u5B58" : "Save"}</button>
                          <button className="btn btn-ghost" style={{ fontSize: "0.7rem", padding: "4px 10px" }} onClick={() => setEditingAliasId(null)}>{isZh ? "\u53D6\u6D88" : "Cancel"}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  const renderModelLibrary = () => (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
        {isZh ? "\u6D4F\u89C8\u6A21\u578B\u5E93\uFF0C\u70B9\u51FB\u6DFB\u52A0\u5230\u5DF2\u5B89\u88C5\u6A21\u578B\u3002\u540C\u4E00\u63D0\u4F9B\u5546\u53EF\u6DFB\u52A0\u591A\u4E2A\u6A21\u578B\u3002" : "Browse the model library and add models to your installed list. Multiple models per provider supported."}
      </div>
      {providerGroups.map((pid) => {
        const models = getModelsForProvider(pid);
        const cfg = isConfigured(pid);
        const fetching = fetchingProvider === pid;
        return (
          <div key={pid} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: cfg ? "var(--green)" : "var(--surface-alt)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", color: cfg ? "white" : "var(--text-muted)", fontWeight: 700 }}>
                {pid.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{pid}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>({models.length})</span>
              {/* Fetch models button */}
              {cfg && (
                <button className="btn btn-ghost" style={{ fontSize: "0.65rem", padding: "2px 8px" }} disabled={fetching} onClick={() => fetchModels(pid)}>
                  {fetching ? "..." : (isZh ? "\u83B7\u53D6\u6A21\u578B" : "Fetch")}
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
              {models.map((m) => {
                const added = isInstalled(m.providerId, m.modelId);
                return (
                  <div key={m.modelId} className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 8, opacity: added ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.8rem", color: "var(--text)" }}>{m.displayName}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{m.modelId}</div>
                      <div style={{ marginTop: 2 }}>
                        {m.capabilities.slice(0, 4).map((c) => (
                          <span key={c} className="badge badge-slate" style={{ fontSize: "0.58rem", marginRight: 2, padding: "1px 4px" }}>{c}</span>
                        ))}
                        {m.contextWindow && (
                          <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginLeft: 4 }}>
                            {m.contextWindow >= 1000000 ? (m.contextWindow / 1000000).toFixed(1) + "M" : (m.contextWindow / 1000).toFixed(0) + "K"}
                          </span>
                        )}
                      </div>
                    </div>
                    {added ? (
                      <span className="badge badge-green" style={{ fontSize: "0.65rem" }}>{isZh ? "\u5DF2\u6DFB\u52A0" : "Added"}</span>
                    ) : (
                      <button className="btn btn-primary" style={{ fontSize: "0.68rem", padding: "4px 12px" }} onClick={() => handleInstall(m.providerId, m.modelId, "registry")}>
                        {isZh ? "\u6DFB\u52A0" : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
              {/* Fetched models not in registry */}
              {fetchedModels.filter((fm) => !models.some((rm) => rm.modelId === fm.id)).map((fm) => {
                const added = isInstalled(pid, fm.id);
                return (
                  <div key={"fetched-" + fm.id} className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 8, opacity: added ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.8rem", color: "var(--text)" }}>{fm.id}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{isZh ? "\u8FDC\u7A0B\u83B7\u53D6" : "Fetched"}</div>
                    </div>
                    {added ? (
                      <span className="badge badge-green" style={{ fontSize: "0.65rem" }}>{isZh ? "\u5DF2\u6DFB\u52A0" : "Added"}</span>
                    ) : (
                      <button className="btn btn-primary" style={{ fontSize: "0.68rem", padding: "4px 12px" }} onClick={() => handleInstall(pid, fm.id, "fetched")}>
                        {isZh ? "\u6DFB\u52A0" : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Provider Edit Modal (simplified from ProvidersScreen)
  const renderEditModal = () => {
    if (!editingProvider) return null;
    const config = providerConfigs.find((c) => c.provider === editingProvider);
    if (!config) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setEditingProvider(null)}>
        <div className="card" style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--text)" }}>{isZh ? "\u7F16\u8F91" : "Edit"}: {config.provider}</h3>
            <button onClick={() => setEditingProvider(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.3rem" }}>&times;</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providers.model")}</label>
              <input className="input" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.85rem" }} value={config.model ?? ""} onChange={(e) => updateConfig(config.provider, { model: e.target.value })} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providers.baseUrl")}</label>
              <input className="input" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.8rem", fontFamily: "monospace" }} value={config.baseUrl ?? ""} onChange={(e) => updateConfig(config.provider, { baseUrl: e.target.value })} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{tk("providers.apiKey")}</label>
              <input className="input" type="password" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: "0.8rem", fontFamily: "monospace" }} value={config.apiKey ?? ""} onChange={(e) => updateConfig(config.provider, { apiKey: e.target.value })} />
            </div>
            {config.lastHealthError && (
              <div style={{ color: "var(--red)", fontSize: "0.8rem", padding: "8px 12px", background: "rgba(255,0,0,0.05)", borderRadius: 8 }}>{tk("common.error")}: {config.lastHealthError}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={!!testingId} onClick={() => runHealthCheck(config.provider)}>
                {testingId ? "..." : tk("providers.healthCheck")}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditingProvider(null)}>{isZh ? "\u5173\u95ED" : "Close"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProviders = () => (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span className="badge badge-green" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>{providerConfigs.filter((c) => c.enabled).length} {isZh ? "\u5DF2\u542F\u7528" : "enabled"}</span>
        <span className="badge badge-blue" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>{providerConfigs.filter((c) => c.lastHealthStatus === "ok").length} {isZh ? "\u5065\u5EB7" : "healthy"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {providerConfigs.map((config) => {
          const testing = testingId === config.provider;
          const configured = !!config.apiKey;
          return (
            <div key={config.provider} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
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
                    <span className={`badge ${getHealthBadge(healthResults[config.provider]?.status ?? config.lastHealthStatus)}`} style={{ fontSize: "0.68rem" }}>{getHealthLabel(healthResults[config.provider]?.status ?? config.lastHealthStatus)}</span>
                    <span className={`badge ${config.enabled ? "badge-green" : "badge-muted"}`} style={{ fontSize: "0.68rem" }}>{config.enabled ? tk("status.enabled") : tk("status.disabled")}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <button className="btn btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 14px" }} disabled={testing} onClick={() => runHealthCheck(config.provider)}>
                  {testing ? "..." : tk("providers.healthCheck")}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "5px 14px" }} onClick={() => { setConfigTargetProvider(config.provider); setShowProviderConfigModal(true); }}>
                  {isZh ? "\u7F16\u8F91" : "Edit"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {renderEditModal()}
    </div>
  );

  const renderRouting = () => (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
        {isZh ? "\u6587\u4EF6\u7C7B\u578B\u8DEF\u7531\u89C4\u5219\uFF1A\u6839\u636E\u6587\u4EF6\u6269\u5C55\u540D\u81EA\u52A8\u5207\u6362\u6A21\u578B\u3002" : "File-type routing rules: auto-switch model based on file extension."}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {ROUTING_RULES.map((rule) => (
          <div key={rule.id} className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)", marginBottom: 6 }}>{rule.name}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>
              <span>{isZh ? "\u6269\u5C55\u540D:" : "Extensions:"}</span> {rule.fileExtensions.join(", ")}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 4 }}>
              <span style={{ color: "var(--primary)" }}>{rule.preferredProviderId}</span> / {rule.preferredModelId}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
              {rule.fallbackProviderId && <span>{isZh ? "\u5907\u7528:" : "Fallback:"} {rule.fallbackProviderId} / {rule.fallbackModelId}</span>}
              {rule.askBeforeSwitch && <span style={{ marginLeft: 8, color: "var(--amber)" }}>{isZh ? "\u5207\u6362\u524D\u8BE2\u95EE" : "Asks before switch"}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ============================================================
     Main Render
     ============================================================ */
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Page Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--text)" }}>
          {tk("providersPage.title")}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {isZh ? "\u7BA1\u7406\u5DF2\u5B89\u88C5\u6A21\u578B\u3001\u6D4F\u89C8\u6A21\u578B\u5E93\u3001\u914D\u7F6E\u63D0\u4F9B\u5546\u548C\u8DEF\u7531\u89C4\u5219" : "Manage installed models, browse library, configure providers, and routing rules"}
        </p>
      </div>

            {/* Top Bar: Onboarding + Add Model */}
      {providerConfigs.filter(c => c.enabled && c.apiKey).length === 0 && (
        <div style={{
          margin: "16px 24px 0", padding: "16px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(79,140,255,0.08), rgba(0,200,100,0.05))",
          border: "1px solid var(--primary)", display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", marginBottom: 4 }}>
              {isZh ? "还没有配置模型提供商" : "No provider configured yet"}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {isZh ? "请先配置一个模型提供商，然后开始聊天。" : "Set up your first model provider to start chatting."}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowSetupWizard(true)}
            style={{ padding: "8px 18px", fontSize: "0.82rem", whiteSpace: "nowrap", fontWeight: 500 }}>
            {isZh ? "配置模型提供商" : "Set up provider"}
          </button>
        </div>
      )}
      {/* Top Bar: Add Model */}
      <div style={{ padding: "8px 24px 0", display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn btn-primary"
          onClick={() => setShowCustomModelModal(true)}
          style={{ padding: "7px 16px", fontSize: "0.8rem", fontWeight: 500 }}
        >
          + {isZh ? "添加模型" : "Add Model"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 24px", gap: 0 }}>
        {tabDefs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 18px", fontSize: "0.8rem", fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "var(--primary)" : "var(--text-muted)",
              background: "none", border: "none", borderBottom: activeTab === tab.id ? "2px solid var(--primary)" : "2px solid transparent",
              cursor: "pointer", transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {getTabLabel(tab.id)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeTab === "installed" && renderInstalledModels()}
        {activeTab === "library" && renderModelLibrary()}
        {activeTab === "providers" && renderProviders()}
        {activeTab === "routing" && renderRouting()}
        {activeTab === "selftest" && <ModelRuntimeSelfTest />}
      </div>
      <ProviderSetupWizard open={showSetupWizard} onClose={() => setShowSetupWizard(false)} onComplete={() => { setProviderConfigs(loadProviderConfigs()); setShowSetupWizard(false); }} />
      <ProviderConfigModal
        open={showProviderConfigModal}
        initialProviderId={configTargetProvider}
        onClose={() => { setShowProviderConfigModal(false); setConfigTargetProvider(undefined); }}
        onSaved={() => {
          setProviderConfigs(loadProviderConfigs());
          setShowProviderConfigModal(false);
        }}
      />
      <CustomModelModal
        open={showCustomModelModal}
        onClose={() => setShowCustomModelModal(false)}
        onAdded={() => {
          setProviderConfigs(loadProviderConfigs());
          setCustomModels(loadCustomModels());
        }}
      />
    </div>
  );
}
