import { useState, useMemo } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";

interface ChatMessage {
  id: string; role: string; content: string;
  timestamp: number; provider?: string; model?: string;
  guardResult?: { flagged: boolean; details: string };
}

interface Conversation {
  id: string; title: string; messages: ChatMessage[];
  createdAt: number; updatedAt: number;
}

function loadConversations(): Conversation[] {
  try {
    const raw = storeGet("tokenfence-conversations");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversations(convs: Conversation[]): void {
  storeSet("tokenfence-conversations", JSON.stringify(convs));
}

type FilterMode = "all" | "safe" | "flagged" | "blocked";

interface HistoryScreenProps {
  onSelectConversation?: (conv: Conversation) => void;
}

export function HistoryScreen({ onSelectConversation }: HistoryScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);

  const filtered = useMemo(() => {
    let result = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some(m => m.content.toLowerCase().includes(q))
      );
    }

    if (filter === "flagged") {
      result = result.filter(c => c.messages.some(m => m.guardResult?.flagged));
    } else if (filter === "safe") {
      result = result.filter(c => c.messages.every(m => !m.guardResult?.flagged));
    } else if (filter === "blocked") {
      result = result.filter(c =>
        c.messages.some(m => m.guardResult?.flagged && m.guardResult.details.includes("blocked"))
      );
    }

    return result;
  }, [conversations, filter, search]);

  function groupByDate(convs: Conversation[]) {
    const groups: { label: string; items: Conversation[] }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;

    const todayItems: Conversation[] = [];
    const yesterdayItems: Conversation[] = [];
    const weekItems: Conversation[] = [];
    const olderItems: Conversation[] = [];

    for (const c of convs) {
      const d = new Date(c.updatedAt).getTime();
      if (d >= today) todayItems.push(c);
      else if (d >= yesterday) yesterdayItems.push(c);
      else if (d >= weekAgo) weekItems.push(c);
      else olderItems.push(c);
    }

    if (todayItems.length) groups.push({ label: tk("history.today"), items: todayItems });
    if (yesterdayItems.length) groups.push({ label: tk("history.yesterday"), items: yesterdayItems });
    if (weekItems.length) groups.push({ label: tk("history.thisWeek"), items: weekItems });
    if (olderItems.length) groups.push({ label: tk("history.older"), items: olderItems });

    return groups;
  }

  const groups = groupByDate(filtered);

  function handleDelete(id: string) {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    saveConversations(updated);
    setDeleteTarget(null);
    if (selectedConv?.id === id) setSelectedConv(null);
  }

  function handleClearAll() {
    setConversations([]);
    saveConversations([]);
    setClearAllConfirm(false);
    setSelectedConv(null);
  }

  function hasFlagged(conv: Conversation): boolean {
    return conv.messages.some(m => m.guardResult?.flagged);
  }

  function countFlagged(conv: Conversation): number {
    return conv.messages.filter(m => m.guardResult?.flagged).length;
  }

  function getGuardSummary(conv: Conversation): string | null {
    const flagged = conv.messages.find(m => m.guardResult?.flagged);
    return flagged?.guardResult?.details || null;
  }

  if (selectedConv) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", borderBottom: "1px solid var(--tf-border)",
          background: "var(--tf-surface)",
        }}>
          <button onClick={() => setSelectedConv(null)} className="tf-btn-ghost tf-btn-sm">
            &larr; {tk("actions.back")}
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--tf-text)" }}>
              {selectedConv.title}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--tf-text-muted)" }}>
              {tk("history.messages").replace("{count}", String(selectedConv.messages.length))}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {selectedConv.messages.map((msg) => (
            <div key={msg.id} style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: "8px",
              background: msg.role === "user" ? "var(--tf-surface-alt)" : "var(--tf-primary-soft)",
              maxWidth: "85%",
              marginLeft: msg.role === "user" ? "auto" : 0,
            }}>
              <div style={{ fontSize: "0.75rem", color: "var(--tf-text)", whiteSpace: "pre-wrap" }}>
                {msg.content.slice(0, 300)}{msg.content.length > 300 ? "..." : ""}
              </div>
              {msg.guardResult?.flagged && (
                <div style={{
                  fontSize: "0.6rem", color: "var(--tf-danger)",
                  marginTop: 4, fontWeight: 600,
                }}>
                  {msg.guardResult.details}
                </div>
              )}
              <div style={{ fontSize: "0.6rem", color: "var(--tf-text-muted)", marginTop: 4 }}>
                {new Date(msg.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--tf-border)" }}>
        <h1 className="page-title" style={{ margin: 0, marginBottom: 4 }}>{tk("history.title")}</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>{tk("history.subtitle")}</p>
      </div>

      {/* Search + Filters */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--tf-border)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="tf-search" style={{ flex: 1, minWidth: 180 }}>
            <input
              className="tf-input"
              placeholder={tk("history.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "safe", "flagged"] as FilterMode[]).map((f) => (
              <button
                key={f}
                className={`tf-btn-sm ${filter === f ? "tf-btn-primary" : "tf-btn-ghost"}`}
                onClick={() => setFilter(f)}
                style={{ fontSize: "0.7rem" }}
              >
                {tk("history.filter" + f.charAt(0).toUpperCase() + f.slice(1))}
              </button>
            ))}
          </div>
          <button
            className="tf-btn-danger tf-btn-sm"
            onClick={() => setClearAllConfirm(true)}
            style={{ fontSize: "0.7rem" }}
            disabled={conversations.length === 0}
          >
            {tk("history.clearAll")}
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
        {filtered.length === 0 ? (
          <div className="tf-empty">
            <div className="tf-empty-title">{tk("history.noConversations")}</div>
            <div className="tf-empty-desc">{tk("history.noConversationsDesc")}</div>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <div className="tf-section-title">{group.label}</div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className="tf-card"
                  style={{
                    padding: "12px 16px",
                    marginBottom: 8,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => {
                    setSelectedConv(conv);
                    onSelectConversation?.(conv);
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontWeight: 600, fontSize: "0.8rem", color: "var(--tf-text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {conv.title}
                      </span>
                      {hasFlagged(conv) && (
                        <span className="tf-badge tf-badge-danger" style={{ fontSize: "0.6rem", padding: "1px 6px" }}>
                          {countFlagged(conv)} {tk("history.filterFlagged")}
                        </span>
                      )}
                    </div>
                    {getGuardSummary(conv) && (
                      <div style={{ fontSize: "0.65rem", color: "var(--tf-text-muted)", marginTop: 2 }}>
                        {getGuardSummary(conv)}
                      </div>
                    )}
                    <div style={{ fontSize: "0.6rem", color: "var(--tf-text-muted)", marginTop: 2 }}>
                      {tk("history.messages").replace("{count}", String(conv.messages.length))} &middot; {new Date(conv.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="tf-btn-ghost tf-btn-sm"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(conv.id); }}
                    style={{ color: "var(--tf-text-muted)", fontSize: "0.65rem", flexShrink: 0 }}
                  >
                    {tk("history.deleteConversation")}
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="tf-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="tf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tf-modal-header">
              <h3 className="tf-modal-title">{tk("history.deleteConfirm")}</h3>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="tf-btn-secondary" onClick={() => setDeleteTarget(null)}>
                {tk("actions.cancel")}
              </button>
              <button className="tf-btn-danger" onClick={() => handleDelete(deleteTarget)}>
                {tk("history.deleteConversation")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear all confirmation */}
      {clearAllConfirm && (
        <div className="tf-overlay" onClick={() => setClearAllConfirm(false)}>
          <div className="tf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tf-modal-header">
              <h3 className="tf-modal-title">{tk("history.clearAllConfirm")}</h3>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="tf-btn-secondary" onClick={() => setClearAllConfirm(false)}>
                {tk("actions.cancel")}
              </button>
              <button className="tf-btn-danger" onClick={handleClearAll}>
                {tk("history.clearAll")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
