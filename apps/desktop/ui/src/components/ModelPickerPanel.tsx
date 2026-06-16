import { useState, useMemo, useCallback, useEffect } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import {
  PROVIDERS, loadProviderConfigs,
} from "@tokenfence/shared/src/providers";
import {
  MODEL_REGISTRY, getModelsForProvider, getDefaultModelForProvider,
  getProviderIds, type ModelRegistryItem,
} from "@tokenfence/shared/src/model-registry";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";

/* ---- storage helpers ---- */
const RECENT_KEY = "tokenfence.recentModels";
const FAV_KEY = "tokenfence.favoriteModels";

interface RecentEntry { providerId: string; modelId: string; usedAt: number; }

function loadRecent(): RecentEntry[] {
  try { const r = storeGet(RECENT_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveRecent(entries: RecentEntry[]) {
  storeSet(RECENT_KEY, JSON.stringify(entries.slice(0, 10)));
}
function addRecent(providerId: string, modelId: string) {
  const recent = loadRecent().filter(e => !(e.providerId === providerId && e.modelId === modelId));
  recent.unshift({ providerId, modelId, usedAt: Date.now() });
  saveRecent(recent);
}

function loadFavorites(): string[] {
  try { const r = storeGet(FAV_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveFavorites(ids: string[]) {
  storeSet(FAV_KEY, JSON.stringify(ids));
}
function favKey(pid: string, mid: string) { return pid + "::" + mid; }

/* ---- capability-based recommendation ---- */
const CAPABILITY_PRIORITY: Record<string, string[]> = {
  chat: ["chat", "code", "vision", "long-context"],
  code: ["code", "chat", "long-context"],
  pdf: ["long-context", "vision", "code", "chat"],
  image: ["vision", "chat", "code"],
  default: ["chat", "code", "vision", "long-context"],
};
const EXT_CATEGORY: Record<string, string> = {
  ts: "code", tsx: "code", js: "code", jsx: "code", py: "code", rs: "code",
  go: "code", java: "code", cpp: "code", c: "code", cs: "code",
  pdf: "pdf", md: "pdf", docx: "pdf",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
};

function getRecommendedModels(
  configuredPids: Set<string>,
  contextHint?: string,
): ModelRegistryItem[] {
  const cat = EXT_CATEGORY[contextHint ?? ""] ?? "default";
  const priorities = CAPABILITY_PRIORITY[cat] ?? CAPABILITY_PRIORITY.default;

  const configured = MODEL_REGISTRY.filter(m => configuredPids.has(m.providerId));
  const unconfigured = MODEL_REGISTRY.filter(m => !configuredPids.has(m.providerId));

  const scored = MODEL_REGISTRY.map(m => {
    let score = 0;
    const caps = (m as any).capabilities as string[] | undefined;
    if (caps) {
      for (let i = 0; i < priorities.length; i++) {
        if (caps.includes(priorities[i])) { score += (priorities.length - i) * 2; }
      }
    }
    if (configuredPids.has(m.providerId)) score += 10;
    if ((m as any).isRecommended) score += 5;
    return { model: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, 12).map(s => s.model);
}

/* ---- component ---- */
interface ModelPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProvider: string;
  selectedModel: string;
  onSelect: (providerId: string, modelId: string) => void;
  attachedFileTypes?: string[];
  onNavigateToProviders?: () => void;
}

type GroupName = "configured" | "recent" | "favorites" | "recommended" | "all";

export function ModelPickerPanel({
  isOpen, onClose, selectedProvider, selectedModel, onSelect,
  attachedFileTypes, onNavigateToProviders,
}: ModelPickerPanelProps) {
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState(selectedProvider);
  const [activeGroup, setActiveGroup] = useState<GroupName>("all");
  const [recentList, setRecentList] = useState<RecentEntry[]>(() => loadRecent());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(loadFavorites()));
  const [showConfigPrompt, setShowConfigPrompt] = useState<{pid:string;mid:string}|null>(null);

  useEffect(() => { if (isOpen) { setRecentList(loadRecent()); setFavoriteIds(new Set(loadFavorites())); } }, [isOpen]);

  const configs = useMemo(() => loadProviderConfigs(), []);

  const configuredPids = useMemo(() => new Set(
    configs.filter(c => c.enabled && c.apiKey).map(c => c.provider)
  ), [configs]);

  const providerConfigured = useCallback((pid: string) =>
    configuredPids.has(pid), [configuredPids]);

  const isLocalProvider = useCallback((pid: string) =>
    pid === "Ollama" || pid === "LM Studio", []);

  const providerIds = useMemo(() => getProviderIds(), []);

  const contextHint = attachedFileTypes?.[0];

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

  const recommendedModels = useMemo(() =>
    getRecommendedModels(configuredPids, contextHint),
  [configuredPids, contextHint]);

  const recentModels = useMemo(() => {
    const entries = recentList.slice(0, 10);
    return entries.map(e => MODEL_REGISTRY.find(m => m.providerId === e.providerId && m.modelId === e.modelId)).filter(Boolean) as ModelRegistryItem[];
  }, [recentList]);

  const groupedModels = useMemo(() => {
    const configured = currentModels.filter((m) => providerConfigured(m.providerId));
    const favorites = currentModels.filter((m) => favoriteIds.has(favKey(m.providerId, m.modelId)));
    const all = currentModels;
    return { configured, recent: recentModels, favorites, recommended: recommendedModels, all };
  }, [currentModels, providerConfigured, recentModels, recommendedModels, favoriteIds]);

  const displayModels = activeGroup === "all" ? groupedModels.all :
    activeGroup === "configured" ? groupedModels.configured :
    activeGroup === "recommended" ? groupedModels.recommended :
    activeGroup === "recent" ? groupedModels.recent :
    groupedModels.favorites;

  const handleSelect = useCallback((pid: string, mid: string) => {
    const isLocal = isLocalProvider(pid);
    if (!providerConfigured(pid) && !isLocal) {
      setShowConfigPrompt({ pid, mid });
      return;
    }
    addRecent(pid, mid);
    setRecentList(loadRecent());
    onSelect(pid, mid);
    onClose();
  }, [providerConfigured, isLocalProvider, onSelect, onClose]);

  const toggleFavorite = useCallback((pid: string, mid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = favKey(pid, mid);
    const next = new Set(favoriteIds);
    if (next.has(key)) next.delete(key); else next.add(key);
    setFavoriteIds(next);
    saveFavorites([...next]);
  }, [favoriteIds]);

  const handleConfigProvider = useCallback(() => {
    setShowConfigPrompt(null);
    onClose();
    if (onNavigateToProviders) onNavigateToProviders();
  }, [onClose, onNavigateToProviders]);

  if (!isOpen) return null;

  const renderModelItem = (m: ModelRegistryItem) => {
    const isSelected = activeProvider === m.providerId && selectedModel === m.modelId;
    const isConfigured = providerConfigured(m.providerId);
    const isLocal = isLocalProvider(m.providerId);
    const isFav = favoriteIds.has(favKey(m.providerId, m.modelId));

    return (
      <div key={m.providerId + m.modelId}
        onClick={() => handleSelect(m.providerId, m.modelId)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 18px", cursor: "pointer",
          background: isSelected ? "var(--surface-alt)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-alt)"; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        {/* Favorite star */}
        <span
          onClick={(e) => toggleFavorite(m.providerId, m.modelId, e)}
          style={{
            cursor: "pointer", fontSize: "0.85rem",
            color: isFav ? "var(--amber)" : "var(--text-muted)",
            userSelect: "none", flexShrink: 0,
          }}
          title={isFav ? tk("mascot.hide") : tk("mascot.show")}
        >{isFav ? "\u2605" : "\u2606"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: "0.82rem", color: "var(--text)" }}>
            {m.displayName ?? m.modelId}
            {isSelected && <span style={{ marginLeft: 6, color: "var(--accent)", fontSize: "0.65rem" }}>{"\u2713"}</span>}
          </div>
        </div>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: isConfigured ? "var(--green)" : isLocal ? "var(--amber)" : "var(--text-muted)",
          flexShrink: 0,
        }}></span>
      </div>
    );
  };

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
          width: "100%", maxWidth: 720, height: "min(560px, 85vh)",
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

        {/* Unconfigured intercept modal */}
        {showConfigPrompt && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 260,
          }}>
            <div className="card" style={{
              background: "var(--surface)", borderRadius: 12, padding: 24,
              maxWidth: 380, textAlign: "center",
            }}>
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>{"\u26A0\uFE0F"}</div>
              <div style={{ fontSize: "0.9rem", color: "var(--text)", marginBottom: 12 }}>
                {tk("chat.configureProviderFirst")}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 16 }}>
                {showConfigPrompt.pid} / {showConfigPrompt.mid}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setShowConfigPrompt(null)} className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "6px 16px" }}>
                  {tk("actions.cancel")}
                </button>
                <button onClick={handleConfigProvider} className="btn btn-primary" style={{ fontSize: "0.8rem", padding: "6px 16px" }}>
                  {tk("chat.configureProviderBtn")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search results override */}
        {searchedModels ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            <div style={{ padding: "4px 18px", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
              {tk("providers.searchModels")} ({searchedModels.length})
            </div>
            {searchedModels.map((m) => renderModelItem(m))}
          </div>
        ) : (
          /* Normal: provider + model browser */
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
              <div style={{ display: "flex", gap: 4, padding: "0 18px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4, flexWrap: "wrap" }}>
                {([
                  ["all", "all"],
                  ["configured", "configuredModels"],
                  ["favorites", "favoriteModels"],
                  ["recent", "recentModels"],
                  ["recommended", "recommendedModels"],
                ] as [GroupName, string][]).map(([g, labelKey]) => {
                  const count = g === "all" ? groupedModels.all.length :
                    g === "configured" ? groupedModels.configured.length :
                    g === "favorites" ? groupedModels.favorites.length :
                    g === "recent" ? groupedModels.recent.length :
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
                      {tk("chat." + labelKey)} ({count})
                    </button>
                  );
                })}
              </div>

              {displayModels.length === 0 ? (
                <div style={{ padding: "30px 18px", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {activeGroup === "recent" ? tk("common.none") + " — " + tk("chat.recentModels") :
                   activeGroup === "favorites" ? tk("common.none") + " — " + tk("chat.favoriteModels") :
                   tk("common.none")}
                </div>
              ) : (
                displayModels.map((m) => renderModelItem(m))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}