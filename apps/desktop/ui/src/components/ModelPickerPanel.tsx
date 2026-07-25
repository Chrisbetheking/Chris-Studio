import { getEnabledModels, type InstalledModel } from "@tokenfence/shared/src/installed-models";
import { useState, useEffect, useMemo } from "react";
import { getEnabledModels, type InstalledModel } from "@tokenfence/shared/src/installed-models";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { getEnabledModels, type InstalledModel } from "@tokenfence/shared/src/installed-models";
import {
  MODEL_REGISTRY, getModelsForProvider, getModelById,
  getDefaultModelForProvider, searchModels,
  getStatusColor, getStatusLabel, getProviderIds,
  pickBestAvailableModel, addRecentModel,
  type ModelRegistryItem,
} from "@tokenfence/shared/src/model-registry";
import { getEnabledModels, type InstalledModel } from "@tokenfence/shared/src/installed-models";
import { loadProviderConfigs, type ProviderConfig } from "@tokenfence/shared/src/providers";
import { resolveActiveModel, getProviderDisplayName, setActiveModelV2, canonicalizeProviderId } from "../data/active-model";
import { ProviderConfigModal } from "./ProviderConfigModal";

interface ModelPickerPanelProps {
  onClose: () => void;
  onSelect: (providerId: string, modelId: string) => void;
  selectedProvider: string;
  selectedModel: string;
  providerConfigs: ProviderConfig[];
  installedModels?: InstalledModel[];
}

export function ModelPickerPanel({
 onClose, onSelect, selectedProvider, selectedModel, providerConfigs, installedModels }: ModelPickerPanelProps) {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);

  const [searchText, setSearchText] = useState("");
  const [activeModelInfo, setActiveModelInfo] = useState<{providerId:string;modelId:string}|null>(() => {
    const resolved = resolveActiveModel();
    return resolved ? { providerId: resolved.providerId, modelId: resolved.modelId } : null;
  });

  useEffect(() => {
    const handler = () => {
      const resolved = resolveActiveModel();
      setActiveModelInfo(resolved ? { providerId: resolved.providerId, modelId: resolved.modelId } : null);
    };
    window.addEventListener("tokenfence:active-model-changed", handler);
    return () => window.removeEventListener("tokenfence:active-model-changed", handler);
  }, []);
  const [activeProvider, setActiveProvider] = useState(selectedProvider);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configureTarget, setConfigureTarget] = useState("");
  const [pendingSelect, setPendingSelect] = useState<{pid: string; mid: string} | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{pid: string; mid: string; name: string} | null>(null);

  const providerIds = useMemo(() => getProviderIds(), []);

  const isConfigured = (pid: string) => {
    const cfg = providerConfigs.find((c) => c.provider === pid);
    return !!(cfg?.apiKey);
  };

  const searchedModels = useMemo(() => {
    if (!searchText.trim() || searchText.trim().length < 2) return [];
    return searchModels(searchText);
  }, [searchText]);

  const currentModels = useMemo(() => getModelsForProvider(activeProvider), [activeProvider]);

  const enabledInstalled = useMemo(() => (installedModels ?? []).filter((m) => m.enabled), [installedModels]);

  const handleSelect = (pid: string, mid: string) => {
    const cfg = providerConfigs.find((c) => c.provider === pid);
    if (!cfg?.apiKey) {
      const name = getModelById(pid, mid)?.displayName || mid;
      setConfirmDialog({ pid, mid, name });
      return;
    }
    addRecentModel(pid, mid);
    setActiveModelV2({ providerId: pid, modelId: mid });
    onSelect(pid, mid);
  };

  const handleConfigureProvider = () => {
    if (confirmDialog) {
      setConfigureTarget(confirmDialog.pid);
      setPendingSelect({ pid: confirmDialog.pid, mid: confirmDialog.mid });
      setConfirmDialog(null);
      setShowConfigModal(true);
    }
  };

  const handleConfigSaved = () => {
    setShowConfigModal(false);
    if (pendingSelect) {
      addRecentModel(pendingSelect.pid, pendingSelect.mid);
      onSelect(pendingSelect.pid, pendingSelect.mid);
      setPendingSelect(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 16, width: 680, maxWidth: "90vw", maxHeight: "80vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 12px 60px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>{tk("chat.selectProviderModel") || "Select Provider / Model"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", padding: "4px 8px" }}>{"\u2715"}</button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={tk("chat.searchModels") || "Search models..."}
            autoFocus
            style={{
              width: "100%", background: "var(--surface-alt)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
              fontSize: "0.85rem", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Body: Provider list + Model list */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: Providers */}
          <div style={{ width: 180, minWidth: 180, borderRight: "1px solid var(--border)", overflowY: "auto", padding: "8px 0" }}>
            <div style={{ padding: "4px 16px 8px", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              {tk("chat.configuredFirst") || "Configured first"}
            </div>
            {[...providerIds].sort((a, b) => {
              const aCfg = isConfigured(a) ? 0 : 1;
              const bCfg = isConfigured(b) ? 0 : 1;
              if (aCfg !== bCfg) return aCfg - bCfg;
              return a.localeCompare(b);
            }).map((pid) => {
              const cfg = isConfigured(pid);
              const models = getModelsForProvider(pid);
              if (models.length === 0) return null;
              return (
                <div
                  key={pid}
                  onClick={() => setActiveProvider(pid)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 16px", cursor: "pointer",
                    background: pid === activeProvider ? "var(--surface-alt)" : "transparent",
                    borderLeft: pid === activeProvider ? "3px solid var(--primary)" : "3px solid transparent",
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: cfg ? "var(--green)" : "var(--text-muted)",
                    flexShrink: 0,
                  }}></span>
                  <span style={{
                    fontSize: "0.8rem", fontWeight: pid === activeProvider ? 600 : 400,
                    color: cfg ? "var(--text)" : "var(--text-muted)",
                  }}>{pid}</span>
                  <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                    {models.length}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right: Models */}
            {/* Installed models section - shown first when not searching */}
            {searchText.trim().length < 2 && enabledInstalled.length > 0 && (
              <>
                <div style={{ padding: "4px 16px 8px", fontSize: "0.65rem", color: "var(--primary)", textTransform: "uppercase" }}>
                  {tk("chat.installedModels") || "Installed Models"}
                </div>
                {enabledInstalled.map((im) => {
                  const isActive = im.providerId === selectedProvider && im.modelId === selectedModel;
                  return (
                    <div
                      key={im.id}
                      onClick={() => handleSelect(im.providerId, im.modelId)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 16px", cursor: "pointer",
                        background: isActive ? "var(--accent-faint, rgba(79,140,255,0.1))" : "transparent",
                        fontSize: "0.8rem",
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--surface-alt)"; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }}></span>
                      <span style={{ fontWeight: isActive ? 600 : 400, color: "var(--text)", flex: 1 }}>
                        {im.displayName}{im.alias ? ` (${im.alias})` : ""}
                      </span>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{im.providerId}</span>
                    </div>
                  );
                })}
                <div style={{ margin: "4px 16px 8px", borderBottom: "1px solid var(--border)" }}></div>
              </>
            )}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {searchText.trim().length >= 2 ? (
              <>
                <div style={{ padding: "4px 16px", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {tk("chat.searchResults") || "Search results"}
                </div>
                {searchedModels.length === 0 ? (
                  <div style={{ padding: "20px 16px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {tk("chat.noModelsFound") || "No models found"}
                  </div>
                ) : (
                  searchedModels.slice(0, 30).map((m) => (
                    <div
                      key={m.providerId + m.modelId}
                      onClick={() => handleSelect(m.providerId, m.modelId)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 16px", cursor: "pointer", fontSize: "0.8rem",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: isConfigured(m.providerId) ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }}></span>
                      <span style={{ fontWeight: 500, color: "var(--text)" }}>{m.displayName}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: "auto" }}>{m.providerName}</span>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <div style={{ padding: "4px 16px 8px", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {getProviderDisplayName(activeProvider) || activeProvider} {tk("chat.models") || "Models"}
                </div>
                {currentModels.map((m) => {
                  const cfg = isConfigured(activeProvider);
                  return (
                    <div
                      key={m.modelId}
                      onClick={() => handleSelect(activeProvider, m.modelId)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 16px", cursor: cfg ? "pointer" : "default",
                        background: m.modelId === selectedModel && activeProvider === selectedProvider ? "var(--accent-faint, rgba(79,140,255,0.1))" : "transparent",
                        fontSize: "0.8rem", opacity: cfg ? 1 : 0.5,
                      }}
                      onMouseEnter={(e) => { if (cfg) e.currentTarget.style.background = "var(--surface-alt)"; }}
                      onMouseLeave={(e) => {
                        if (m.modelId === selectedModel && activeProvider === selectedProvider) {
                          e.currentTarget.style.background = "var(--accent-faint, rgba(79,140,255,0.1))";
                        } else {
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      <span style={{ color: "var(--text)", flex: 1 }}>{m.displayName}</span>
                      {m.isRecommended && (
                        <span style={{ fontSize: "0.6rem", background: "var(--primary)", color: "white", padding: "1px 5px", borderRadius: 8 }}>REC</span>
                      )}
                      {activeModelInfo && canonicalizeProviderId(activeModelInfo.providerId) === canonicalizeProviderId(activeProvider) && activeModelInfo.modelId === m.modelId && (
                        <span style={{ fontSize: "0.6rem", background: "var(--green, #22c55e)", color: "white", padding: "1px 5px", borderRadius: 8, fontWeight: 600 }}>{tk("chat.inUse") || "In use"}</span>
                      )}
                      <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                        {m.contextWindow ? (m.contextWindow >= 1000000 ? (m.contextWindow / 1000000).toFixed(1) + "M" : (m.contextWindow / 1000).toFixed(0) + "K") : ""}
                      </span>
                      {!cfg && (
                        <span style={{ fontSize: "0.6rem", color: "var(--amber)" }}>{tk("common.notConfigured") || "Not configured"}</span>
                      )}
                      {cfg && !(activeModelInfo && canonicalizeProviderId(activeModelInfo.providerId) === canonicalizeProviderId(activeProvider) && activeModelInfo.modelId === m.modelId) && (
                        <span style={{ fontSize: "0.6rem", color: "var(--primary)", fontWeight: 500 }}>{tk("chat.setAsActive") || "Set as active"}</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
      <ProviderConfigModal
        open={showConfigModal}
        initialProviderId={configureTarget}
        onClose={() => { setShowConfigModal(false); setPendingSelect(null); }}
        onSaved={handleConfigSaved}
      />
      {confirmDialog && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 11000,
          background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDialog(null)}>
          <div style={{
            background: "var(--tf-surface, #1e1e2e)", borderRadius: 12, padding: "24px 28px",
            maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            border: "1px solid var(--tf-border, #333)", textAlign: "center",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 600, color: "var(--text)" }}>
              {tk("chat.configureProviderFirst") || "Provider not configured"}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 8px" }}>
              <strong>{confirmDialog.pid}</strong> / {confirmDialog.name}
            </p>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 18px" }}>
              {tk("chat.configureNow") || "Configure now?"}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDialog(null)}
                style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {tk("common.cancel") || "Cancel"}
              </button>
              <button className="btn btn-primary" onClick={handleConfigureProvider}
                style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {tk("chat.configureProvider") || "Configure Provider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
