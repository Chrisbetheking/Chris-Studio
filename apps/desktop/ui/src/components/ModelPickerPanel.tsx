import { useState, useMemo, useCallback } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import {
  PROVIDERS, loadProviderConfigs,
} from "@tokenfence/shared/src/providers";
import {
  MODEL_REGISTRY, getModelsForProvider, getDefaultModelForProvider,
  getProviderIds, type ModelRegistryItem,
} from "@tokenfence/shared/src/model-registry";

interface ModelPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProvider: string;
  selectedModel: string;
  onSelect: (providerId: string, modelId: string) => void;
}

type GroupName = "configured" | "recent" | "recommended" | "all";

export function ModelPickerPanel({
  isOpen, onClose, selectedProvider, selectedModel, onSelect,
}: ModelPickerPanelProps) {
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState(selectedProvider);
  const [activeGroup, setActiveGroup] = useState<GroupName>("all");

  const configs = useMemo(() => loadProviderConfigs(), []);

  const providerConfigured = useCallback((pid: string) =>
    configs.some((c) => c.provider === pid && c.enabled && c.apiKey),
  [configs]);

  const providerIds = useMemo(() => getProviderIds(), []);

  const searchedModels = useMemo(() => {
    if (search.trim().length < 2) return null;
    const q = search.toLowerCase().trim();
    return MODEL_REGISTRY.filter((m) =>
      m.displayName?.toLowerCase().includes(q) ||
      m.modelId.toLowerCase().includes(q) ||
      m.providerName?.toLowerCase().includes(q) ||
      m.providerId.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [search]);

  const currentModels = useMemo(() => getModelsForProvider(activeProvider), [activeProvider]);

  const groupedModels = useMemo(() => {
    const configured = currentModels.filter((m) => providerConfigured(m.providerId));
    const rest = currentModels.filter((m) => !providerConfigured(m.providerId));
    // Simulated: top 3 are recommended
    const recommended = rest.slice(0, 3);
    const all = currentModels;
    return { configured, recent: [], recommended, all };
  }, [currentModels, providerConfigured]);

  const displayModels = activeGroup === "all" ? groupedModels.all :
    activeGroup === "configured" ? groupedModels.configured :
    activeGroup === "recommended" ? groupedModels.recommended :
    groupedModels.recent;

  const handleSelect = useCallback((pid: string, mid: string) => {
    onSelect(pid, mid);
    onClose();
  }, [onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 250, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          background: "var(--surface)", borderRadius: 14,
          width: "100%", maxWidth: 680, height: "min(520px, 85vh)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid var(--border)",
        }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>
            {tk("chat.modelPickerTitle")}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", padding: "2px 6px" }}
          >{"\u2715"}</button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tk("providers.searchModels")}
            autoFocus
            style={{
              width: "100%", background: "var(--surface-alt)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px",
              fontSize: "0.82rem", outline: "none",
            }}
          />
        </div>

        {/* Search results override */}
        {searchedModels ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            <div style={{ padding: "4px 18px", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
              {tk("providers.searchModels")} ({searchedModels.length})
            </div>
            {searchedModels.map((m) => (
              <div key={m.providerId + m.modelId}
                onClick={() => handleSelect(m.providerId, m.modelId)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
                  cursor: "pointer", fontSize: "0.82rem",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: providerConfigured(m.providerId) ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }}></span>
                <span style={{ fontWeight: 500, color: "var(--text)" }}>{m.displayName ?? m.modelId}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: "auto" }}>{m.providerName ?? m.providerId}</span>
              </div>
            ))}
          </div>
        ) : (
          /* Two-column layout */
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Left: Provider list */}
            <div style={{
              width: 200, borderRight: "1px solid var(--border)",
              overflowY: "auto", flexShrink: 0,
            }}>
              {providerIds.map((pid) => {
                const models = getModelsForProvider(pid);
                const configured = providerConfigured(pid);
                const active = pid === activeProvider;
                return (
                  <div key={pid}
                    onClick={() => { setActiveProvider(pid); setActiveGroup("all"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 14px", cursor: "pointer",
                      background: active ? "var(--surface-alt)" : "transparent",
                      borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: configured ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }}></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: active ? 600 : 400, fontSize: "0.78rem", color: "var(--text)" }}>{pid}</div>
                      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                        {models.filter((m) => providerConfigured(m.providerId)).length} / {models.length}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Models */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
              {/* Group tabs */}
              <div style={{ display: "flex", gap: 4, padding: "0 18px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                {([
                  ["all", "all"],
                  ["configured", "configuredModels"],
                  ["recommended", "recommendedModels"],
                ] as [GroupName, string][]).map(([g, labelKey]) => {
                  const count = g === "all" ? groupedModels.all.length :
                    g === "configured" ? groupedModels.configured.length :
                    groupedModels.recommended.length;
                  return (
                    <button key={g}
                      onClick={() => setActiveGroup(g)}
                      style={{
                        background: activeGroup === g ? "var(--accent)" : "transparent",
                        color: activeGroup === g ? "#fff" : "var(--text-muted)",
                        border: "none", borderRadius: 14, padding: "4px 12px",
                        fontSize: "0.7rem", cursor: "pointer", fontWeight: activeGroup === g ? 600 : 400,
                      }}
                    >
                      {tk(`providers.${labelKey}`)} ({count})
                    </button>
                  );
                })}
              </div>

              {displayModels.length === 0 ? (
                <div style={{ padding: "30px 18px", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {tk("common.none")}
                </div>
              ) : (
                displayModels.map((m) => {
                  const isSelected = activeProvider === m.providerId && selectedModel === m.modelId;
                  return (
                    <div key={m.modelId}
                      onClick={() => handleSelect(m.providerId, m.modelId)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 18px", cursor: "pointer",
                        background: isSelected ? "var(--surface-alt)" : "transparent",
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-alt)"; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: "0.82rem", color: "var(--text)" }}>
                          {m.displayName ?? m.modelId}
                          {isSelected && <span style={{ marginLeft: 6, color: "var(--accent)", fontSize: "0.65rem" }}>\u2713</span>}
                        </div>
                      </div>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: providerConfigured(m.providerId) ? "var(--green)" : "var(--text-muted)",
                        flexShrink: 0,
                      }}></span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
