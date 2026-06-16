import { useState, useMemo } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import {
  MODEL_REGISTRY, getModelsForProvider, getModelById,
  getDefaultModelForProvider, searchModels,
  getStatusColor, getStatusLabel, getProviderIds,
  pickBestAvailableModel, addRecentModel,
  type ModelRegistryItem,
} from "@tokenfence/shared/src/model-registry";
import { loadProviderConfigs, type ProviderConfig } from "@tokenfence/shared/src/providers";

interface ModelPickerPanelProps {
  onClose: () => void;
  onSelect: (providerId: string, modelId: string) => void;
  selectedProvider: string;
  selectedModel: string;
  providerConfigs: ProviderConfig[];
}

export function ModelPickerPanel({ onClose, onSelect, selectedProvider, selectedModel, providerConfigs }: ModelPickerPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [activeProvider, setActiveProvider] = useState(selectedProvider);

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

  const handleSelect = (pid: string, mid: string) => {
    const cfg = providerConfigs.find((c) => c.provider === pid);
    if (!cfg?.apiKey) {
      // Unconfigured - notify user
      alert(tk("chat.configureProviderFirst"));
      return;
    }
    addRecentModel(pid, mid);
    onSelect(pid, mid);
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
                  {activeProvider} {tk("chat.models") || "Models"}
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
                      <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                        {m.contextWindow ? (m.contextWindow >= 1000000 ? (m.contextWindow / 1000000).toFixed(1) + "M" : (m.contextWindow / 1000).toFixed(0) + "K") : ""}
                      </span>
                      {!cfg && (
                        <span style={{ fontSize: "0.6rem", color: "var(--amber)" }}>{tk("common.notConfigured") || "Not configured"}</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
