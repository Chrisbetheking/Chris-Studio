import { useState, useCallback } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import {
  PROVIDERS,
  PROVIDER_ENDPOINTS,
  loadProviderConfigs,
  saveProviderConfigs,
  healthCheckProvider,
} from "@tokenfence/shared/src/providers";
import type { ProviderConfig } from "@tokenfence/shared/src/providers";

interface EditState {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export function ProvidersScreen() {
  const [configs, setConfigs] = useState<ProviderConfig[]>(loadProviderConfigs());
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);

  const save = useCallback((next: ProviderConfig[]) => {
    setConfigs(next);
    saveProviderConfigs(next);
  }, []);

  const toggleEnabled = useCallback((provider: string) => {
    setConfigs((prev) => {
      const next = prev.map((c) => (c.provider === provider ? { ...c, enabled: !c.enabled } : c));
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

  const openEdit = useCallback((c: ProviderConfig) => {
    setEditing({
      provider: c.provider,
      model: c.model,
      baseUrl: c.baseUrl,
      apiKey: c.apiKey,
      enabled: c.enabled,
    });
  }, []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    setConfigs((prev) => {
      const next = prev.map((c) =>
        c.provider === editing.provider
          ? { ...c, model: editing.model, baseUrl: editing.baseUrl, apiKey: editing.apiKey, enabled: editing.enabled }
          : c
      );
      saveProviderConfigs(next);
      return next;
    });
    setEditing(null);
  }, [editing]);

  const providerMeta: Record<string, { icon: string; models: number }> = {
    OpenAI: { icon: "\u{1F916}", models: 20 },
    Claude: { icon: "\u{1F9E0}", models: 10 },
    Gemini: { icon: "\u{1F4CE}", models: 8 },
    DeepSeek: { icon: "\u{1F30A}", models: 5 },
    Qwen: { icon: "\u2601\uFE0F", models: 11 },
    Kimi: { icon: "\u{1F31F}", models: 6 },
    Doubao: { icon: "\u{1FADB}", models: 7 },
    Zhipu: { icon: "\u{1F3EE}", models: 14 },
    Ollama: { icon: "\u{1F42B}", models: 0 },
    "LM Studio": { icon: "\u{1F4BB}", models: 0 },
    Custom: { icon: "\u2699\uFE0F", models: 0 },
  };

  return (
    <div>
      <h1 className="page-title">{tk("nav.providers")}</h1>
      <p className="page-subtitle">{tk("providers.configure")}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={runAllHealthChecks}>{tk("providers.runAllHealth")}</button>
        <span className="badge badge-green">{configs.filter((c) => c.enabled).length} {tk("status.enabled")}</span>
        <span className="badge badge-blue">{configs.filter((c) => c.lastHealthStatus === "ok").length} {tk("providers.healthy")}</span>
      </div>

      {/* Summary Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {configs.map((config) => {
          const meta = providerMeta[config.provider] ?? { icon: "\u{1F310}", models: 0 };
          const testing = testingId === config.provider;
          const statusColor =
            config.lastHealthStatus === "ok" ? "var(--green)" :
            config.lastHealthStatus === "degraded" ? "var(--amber)" :
            config.lastHealthStatus === "error" ? "var(--red)" : "var(--text-muted)";

          return (
            <div
              key={config.provider}
              className="card"
              style={{ padding: 14, cursor: "pointer" }}
              onClick={() => openEdit(config)}
            >
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>
                      {tk(`providers.${config.provider.toLowerCase().replace(/\s+/g, "")}` as any) || config.provider}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      {config.deployment === "local" ? tk("providers.local") : tk("providers.cloud")}
                      {" \u00B7 "}{meta.models} {tk("providers.modelsAvailable")}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor }} title={config.lastHealthStatus ?? "unknown"}></span>
                  <label className="toggle" onClick={(e) => { e.stopPropagation(); toggleEnabled(config.provider); }}>
                    <input type="checkbox" checked={config.enabled} readOnly />
                    <span style={{ fontSize: "0.7rem" }}>{config.enabled ? tk("status.enabled") : tk("status.disabled")}</span>
                  </label>
                </div>
              </div>

              {/* Model info */}
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                {config.customModelId || config.model || tk("providers.noModel")}
              </div>

              {/* Health status */}
              {config.lastHealthCheck && (
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>
                  {tk("providers.lastCheck")}: {new Date(config.lastHealthCheck).toLocaleString()}
                </div>
              )}
              {config.lastHealthError && (
                <div style={{ fontSize: "0.65rem", color: "var(--red)", marginBottom: 4 }}>{config.lastHealthError.slice(0, 80)}</div>
              )}

              {/* Quick health check button */}
              <button
                className="btn btn-secondary"
                style={{ marginTop: 6, fontSize: "0.72rem", padding: "3px 10px", width: "100%" }}
                disabled={testing}
                onClick={(e) => { e.stopPropagation(); runHealthCheck(config.provider); }}
              >
                {testing ? tk("providers.testing") : tk("providers.healthCheck")}
              </button>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200, padding: 16,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            className="card"
            style={{
              background: "var(--surface)", maxWidth: 460, width: "100%",
              padding: 20, borderRadius: 12, maxHeight: "90vh", overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--text)" }}>
                {tk("providers.editProvider")}: {editing.provider}
              </h3>
              <button
                onClick={() => setEditing(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", padding: "2px 6px" }}
              >\u2715</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>{tk("providers.model")}</label>
                <input className="input" style={{ width: "100%", padding: "6px 10px", fontSize: "0.8rem" }}
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>{tk("providers.baseUrl")}</label>
                <input className="input" style={{ width: "100%", padding: "6px 10px", fontSize: "0.75rem", fontFamily: "monospace" }}
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>{tk("providers.apiKey")}</label>
                <input className="input" type="password" style={{ width: "100%", padding: "6px 10px", fontSize: "0.75rem", fontFamily: "monospace" }}
                  value={editing.apiKey}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  placeholder="sk-..." />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label className="toggle">
                  <input type="checkbox" checked={editing.enabled}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                  <span>{editing.enabled ? tk("status.enabled") : tk("status.disabled")}</span>
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdit}>{tk("actions.save")}</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditing(null)}>{tk("actions.cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
