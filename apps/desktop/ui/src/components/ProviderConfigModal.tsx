import { useState, useEffect } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import { loadProviderConfigs, saveProviderConfigs, PROVIDER_ENDPOINTS, type ProviderConfig } from "@tokenfence/shared/src/providers";
import { loadHealthResults } from "../data/active-model";

/* ============================================================
   ProviderConfigModal — Configure provider API key etc. v1.2.9
   Supports initialProviderId to pre-select a provider.
   ============================================================ */

interface Props {
  open: boolean;
  initialProviderId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ProviderConfigModal({ open, initialProviderId, onClose, onSaved }: Props) {
  const isZh = tk("common.yes") !== "Yes";

  const [configs, setConfigs] = useState<ProviderConfig[]>(() => loadProviderConfigs());
  const [activePid, setActivePid] = useState(initialProviderId || "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "error">("ok");

  const healthResults = loadHealthResults();

  // Sync form when activeProvider changes
  useEffect(() => {
    if (!activePid) return;
    const cfg = configs.find((c) => c.provider === activePid);
    if (cfg) {
      setApiKey(cfg.apiKey || "");
      setBaseUrl(cfg.baseUrl || PROVIDER_ENDPOINTS[activePid]?.baseUrl || "");
      setDefaultModel(cfg.defaultModel || cfg.model || "");
      setEnabled(cfg.enabled !== false);
    }
  }, [activePid, configs]);

  // Set initial provider on open
  useEffect(() => {
    if (open && initialProviderId) {
      setActivePid(initialProviderId);
    }
  }, [open, initialProviderId]);

  if (!open) return null;

  const activeCfg = configs.find((c) => c.provider === activePid);
  const endpointInfo = activePid ? PROVIDER_ENDPOINTS[activePid] : null;

  const health = activePid ? healthResults[activePid] : null;

  const handleSave = () => {
    setSaving(true);
    setMessage("");
    try {
      const updated = [...configs];
      const idx = updated.findIndex((c) => c.provider === activePid);
      if (idx >= 0) {
        updated[idx] = {
          ...updated[idx],
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          defaultModel: defaultModel.trim() || undefined,
          model: defaultModel.trim() || updated[idx].model,
          enabled,
        };
      } else {
        // Create new config entry
        updated.push({
          provider: activePid,
          displayName: activePid,
          deployment: "cloud" as const,
          enabled,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          defaultModel: defaultModel.trim() || undefined,
          model: defaultModel.trim() || undefined,
          lastHealthStatus: "unknown" as const,
        });
      }
      saveProviderConfigs(updated);
      setConfigs(updated);
      setMsgType("ok");
      setMessage(isZh ? "\u4FDD\u5B58\u6210\u529F" : "Saved successfully");
      setTimeout(() => { setMessage(""); onSaved(); }, 800);
    } catch (e: any) {
      setMsgType("error");
      setMessage(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const providerIds = [...new Set(configs.map((c) => c.provider))];
  // Add known providers not yet configured
  const knownIds = Object.keys(PROVIDER_ENDPOINTS);
  for (const pid of knownIds) {
    if (!providerIds.includes(pid)) providerIds.push(pid);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--tf-surface, #1e1e2e)", borderRadius: 12,
        padding: "24px 28px", minWidth: 500, maxWidth: 580,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        border: "1px solid var(--tf-border, #333)",
        maxHeight: "85vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--text)" }}>
            {isZh ? "\u914D\u7F6E\u63D0\u4F9B\u5546" : "Configure Provider"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", padding: "4px 8px" }}>{"\u2715"}</button>
        </div>

        {/* Provider selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
            {isZh ? "\u63D0\u4F9B\u5546" : "Provider"}
          </label>
          <select
            value={activePid}
            onChange={(e) => setActivePid(e.target.value)}
            style={{
              width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)",
            }}
          >
            <option value="">{isZh ? "\u2014 \u9009\u62E9\u63D0\u4F9B\u5546 \u2014" : "\u2014 Select provider \u2014"}</option>
            {providerIds.map((pid) => {
              const cfg = configs.find((c) => c.provider === pid);
              const configured = !!(cfg?.apiKey);
              return (
                <option key={pid} value={pid}>
                  {pid}{configured ? " \u2713" : ""}
                </option>
              );
            })}
          </select>
        </div>

        {activePid && (
          <>
            {/* Health status */}
            {health && (
              <div style={{
                padding: "6px 10px", marginBottom: 12, borderRadius: 6, fontSize: "0.72rem",
                background: health.status === "ok" ? "rgba(0,200,100,0.12)" :
                  health.status === "degraded" ? "rgba(255,180,0,0.12)" :
                  health.status === "failed" ? "rgba(255,80,80,0.12)" :
                  "rgba(128,128,128,0.12)",
                color: health.status === "ok" ? "var(--green)" :
                  health.status === "degraded" ? "var(--amber)" :
                  health.status === "failed" ? "var(--red)" : "var(--text-muted)",
              }}>
                {health.status === "ok" ? (isZh ? "\u5065\u5EB7" : "Healthy") :
                 health.status === "degraded" ? (isZh ? "\u964D\u7EA7" : "Degraded") :
                 health.status === "failed" ? (isZh ? "\u5931\u8D25" : "Failed") :
                 health.status === "not_configured" ? (isZh ? "\u672A\u914D\u7F6E" : "Not configured") :
                 (isZh ? "\u672A\u77E5" : "Unknown")}
                {health.latencyMs != null ? ` \u2022 ${health.latencyMs}ms` : ""}
                {health.error ? ` \u2022 ${health.error}` : ""}
              </div>
            )}

            {/* Endpoint info */}
            {endpointInfo && (
              <div style={{ padding: "6px 10px", marginBottom: 12, borderRadius: 6, background: "var(--surface-alt)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                Endpoint: {endpointInfo.baseUrl}{endpointInfo.chatEndpoint?.replace("{model}", "...")}
              </div>
            )}

            {/* API Key */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-... or your API key"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Base URL */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={endpointInfo?.baseUrl || "https://api.example.com/v1"}
                style={{
                  width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Default Model */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
                {isZh ? "\u9ED8\u8BA4\u6A21\u578B" : "Default Model"}
              </label>
              <input
                type="text"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="e.g. gpt-4o"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Enabled toggle */}
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
                  style={{ accentColor: "var(--primary)" }} />
                {isZh ? "\u542F\u7528" : "Enabled"}
              </label>
            </div>
          </>
        )}

        {/* Message */}
        {message && (
          <div style={{
            padding: "8px 12px", marginBottom: 12, borderRadius: 6, fontSize: "0.78rem",
            background: msgType === "ok" ? "rgba(0,200,100,0.12)" : "rgba(255,80,80,0.12)",
            color: msgType === "ok" ? "var(--green)" : "var(--red)",
          }}>{message}</div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
            {isZh ? "\u53D6\u6D88" : "Cancel"}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !activePid} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
            {saving ? "..." : isZh ? "\u4FDD\u5B58" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
