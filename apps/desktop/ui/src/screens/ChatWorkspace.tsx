import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Send, Paperclip, X, Shield, AlertTriangle, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { tk } from "@tokenfence/shared/src/i18n";
import { PROVIDERS, PROVIDER_ENDPOINTS, type ProviderConfig, loadProviderConfigs, saveProviderConfigs, estimateTokens } from "@tokenfence/shared/src/providers";
import { MODEL_REGISTRY, getModelsForProvider, getDefaultModelForProvider, getStatusColor, getStatusLabel } from "@tokenfence/shared/src/model-registry";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";
import { scanPrompt } from "@tokenfence/shared/src/guard";
import type { GuardResult } from "@tokenfence/shared/src/types";
import { SafetyInspector } from "../components/SafetyInspector";
import { SafetyReceipt } from "../components/SafetyReceipt";

/* ============================================================
   Types
   ============================================================ */

interface ChatMessage {
  id: string; role: "user" | "assistant" | "system";
  content: string; timestamp: number;
  provider?: string; model?: string;
  guardResult?: { flagged: boolean; details: string };
}

interface Conversation {
  id: string; title: string; messages: ChatMessage[];
  createdAt: number; updatedAt: number;
}

interface AttachedFile {
  id: string; name: string; size: number; type: string; content: string;
}

type ReviewState = "idle" | "reviewed" | "approved" | "blocked";

/* ============================================================
   Helpers
   ============================================================ */

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

function loadConversations(): Conversation[] {
  try { const raw = storeGet("tokenfence-conversations"); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

function saveConversations(convs: Conversation[]): void {
  storeSet("tokenfence-conversations", JSON.stringify(convs));
}

function pickDefaultProvider(): { provider: string; model: string } {
  try {
    const cfgs = loadProviderConfigs();
    // Prefer DeepSeek, then first configured cloud provider, then Ollama
    const ds = cfgs.find(c => c.provider === "DeepSeek" && c.enabled && c.apiKey);
    if (ds) return { provider: "DeepSeek", model: ds.model || "deepseek-chat" };
    for (const c of cfgs) {
      if (c.enabled && c.apiKey && c.deployment === "cloud") {
        return { provider: c.provider, model: c.model };
      }
    }
    for (const c of cfgs) {
      if (c.enabled && c.deployment === "local") {
        return { provider: c.provider, model: c.model };
      }
    }
  } catch {}
  return { provider: "DeepSeek", model: "deepseek-chat" };
}

/* ============================================================
   Component
   ============================================================ */

export function ChatWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [composerText, setComposerText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState(false);

  // Provider selection
  const defaultProv = useMemo(() => pickDefaultProvider(), []);
  const [selectedProvider, setSelectedProvider] = useState(defaultProv.provider);
  const [selectedModel, setSelectedModel] = useState(defaultProv.model);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>(loadProviderConfigs);

  // Safety review state
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [guardResult, setGuardResult] = useState<GuardResult | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConv = useMemo(
    () => conversations.find(c => c.id === activeConvId) || null,
    [conversations, activeConvId]
  );

  const messages = activeConv?.messages || [];

  // Auto-create conversation on first message
  const ensureConversation = useCallback((): Conversation => {
    if (activeConv && activeConvId) return activeConv;
    const conv: Conversation = {
      id: uid(), title: "",
      messages: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    setConversations(prev => [...prev, conv]);
    setActiveConvId(conv.id);
    return conv;
  }, [activeConv, activeConvId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refresh provider configs
  useEffect(() => {
    const interval = setInterval(() => {
      setProviderConfigs(loadProviderConfigs());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Invalidate review on edit
  const handleTextChange = useCallback((text: string) => {
    setComposerText(text);
    if (reviewState !== "idle") {
      setReviewState("idle");
      setGuardResult(null);
    }
  }, [reviewState]);

  // Attach file
  const handleAttachFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const attached: AttachedFile = {
        id: uid(), name: file.name, size: file.size,
        type: file.type || file.name.split(".").pop() || "txt",
        content: content.slice(0, 100000),
      };
      setAttachedFiles(prev => [...prev, attached]);
      if (reviewState !== "idle") { setReviewState("idle"); setGuardResult(null); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [reviewState]);

  const removeFile = useCallback((id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
    if (reviewState !== "idle") { setReviewState("idle"); setGuardResult(null); }
  }, [reviewState]);

  // CONVERSATION OPERATIONS
  const deleteConversation = useCallback((id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated); saveConversations(updated);
    if (activeConvId === id) setActiveConvId("");
  }, [conversations, activeConvId]);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, title, updatedAt: Date.now() } : c);
      saveConversations(updated);
      return updated;
    });
  }, []);

  // Open conversation from History
  const openConversation = useCallback((convId: string) => {
    setActiveConvId(convId);
    setReviewState("idle"); setGuardResult(null); setComposerText(""); setAttachedFiles([]);
  }, []);

  // REVIEW ? scan prompt + all attachments
  const handleReview = useCallback(() => {
    const text = composerText.trim();
    const hasAttachments = attachedFiles.length > 0;
    if (!text && !hasAttachments) return;

    // Build full text to scan: prompt + all attachment contents
    let fullText = text;
    if (hasAttachments) {
      const fileTexts = attachedFiles.map(f => `[File: ${f.name}]\n${f.content}`).join("\n\n");
      fullText = text ? text + "\n\n" + fileTexts : fileTexts;
    }

    // ALWAYS scan ? never depend on activeConv
    const result = scanPrompt(fullText);
    setGuardResult(result);

    if (result.riskLevel === "high") {
      setReviewState("blocked");
      // Auto-show receipt for critical findings
      setShowReceipt(true);
    } else {
      setReviewState("reviewed");
    }
  }, [composerText, attachedFiles]);

  // APPROVE & SEND ? send redacted content
  const handleApproveSend = useCallback(async () => {
    if (reviewState !== "reviewed" || !guardResult) return;

    const text = composerText.trim();
    const hasAttachments = attachedFiles.length > 0;
    if (!text && !hasAttachments) return;

    const conv = ensureConversation();

    // Build safe (redacted) content
    const safeText = guardResult.redacted;

    // Build safe file contents
    const safeFileTexts = attachedFiles.map(f => {
      const fileResult = scanPrompt(f.content);
      return `[File: ${f.name}]\n${fileResult.redacted}`;
    });

    const safeFullContent = hasAttachments
      ? (text ? safeText + "\n\n" + safeFileTexts.join("\n\n") : safeFileTexts.join("\n\n"))
      : safeText;

    // Guard result for user message
    const msgGuardResult = guardResult.riskLevel !== "safe"
      ? { flagged: true, details: guardResult.findings.map(f => f.label).join(", ") }
      : undefined;

    const userMsg: ChatMessage = {
      id: uid(), role: "user",
      content: safeFullContent,  // store redacted version
      timestamp: Date.now(),
      provider: selectedProvider, model: selectedModel,
      guardResult: msgGuardResult,
    };

    // Add user message
    const msgs = [...messages, userMsg];
    const updated = conversations.map(c =>
      c.id === conv.id
        ? { ...c, messages: msgs, title: c.title || text.slice(0, 50), updatedAt: Date.now() }
        : c
    );
    setConversations(updated); saveConversations(updated);
    setComposerText(""); setAttachedFiles([]);
    setReviewState("idle");
    setSending(true);

    // Call API with safe content
    try {
      const config = providerConfigs.find(c => c.provider === selectedProvider);
      if (!config) {
        const errorMsg: ChatMessage = {
          id: uid(), role: "assistant",
          content: `[Error] Provider "${selectedProvider}" not configured.`,
          timestamp: Date.now(), provider: selectedProvider, model: selectedModel,
        };
        const withError = [...msgs, errorMsg];
        const updated2 = conversations.map(c => c.id === conv.id ? { ...c, messages: withError, updatedAt: Date.now() } : c);
        setConversations(updated2); saveConversations(updated2);
        setSending(false); return;
      }

      const mid = config.customModelId || config.model || selectedModel;
      const ep = PROVIDER_ENDPOINTS[config.provider];
      if (!ep) {
        const errorMsg: ChatMessage = {
          id: uid(), role: "assistant",
          content: `[Error] Unknown provider "${config.provider}"`,
          timestamp: Date.now(), provider: selectedProvider, model: selectedModel,
        };
        const withError = [...msgs, errorMsg];
        const updated2 = conversations.map(c => c.id === conv.id ? { ...c, messages: withError, updatedAt: Date.now() } : c);
        setConversations(updated2); saveConversations(updated2);
        setSending(false); return;
      }

      if (!config.apiKey && config.deployment === "cloud") {
        const errorMsg: ChatMessage = {
          id: uid(), role: "assistant",
          content: `[Preview] Configure "${config.provider}" API key in Providers.`,
          timestamp: Date.now(), provider: selectedProvider, model: selectedModel,
        };
        const withError = [...msgs, errorMsg];
        const updated2 = conversations.map(c => c.id === conv.id ? { ...c, messages: withError, updatedAt: Date.now() } : c);
        setConversations(updated2); saveConversations(updated2);
        setSending(false); return;
      }

      const apiMessages = [{ role: "user", content: safeFullContent }];
      const url = `${config.baseUrl || ep.baseUrl}${ep.chatEndpoint.replace("{model}", mid)}`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) {
        if (config.provider === "Claude") { headers["x-api-key"] = config.apiKey; headers["anthropic-version"] = "2023-06-01"; }
        else if (config.provider === "Gemini") { headers["x-goog-api-key"] = config.apiKey; }
        else { headers["Authorization"] = `Bearer ${config.apiKey}`; }
      }

      let body: Record<string, unknown>;
      if (config.provider === "Claude") {
        body = { model: mid, max_tokens: 2048, messages: apiMessages.map(m => ({ role: m.role, content: m.content })) };
      } else if (config.provider === "Gemini") {
        body = { contents: apiMessages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
      } else {
        body = { model: mid, messages: apiMessages, max_tokens: 2048 };
      }

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(t);

      let responseText: string;
      if (!resp.ok) {
        const e = await resp.text().catch(() => "Unknown error");
        responseText = `[Error: ${resp.status}] ${e.slice(0, 300)}`;
      } else {
        const data = await resp.json();
        if (config.provider === "Claude") responseText = data?.content?.[0]?.text ?? JSON.stringify(data).slice(0, 500);
        else if (config.provider === "Gemini") responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(data).slice(0, 500);
        else responseText = data?.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 500);
      }

      const assistantMsg: ChatMessage = {
        id: uid(), role: "assistant",
        content: responseText, timestamp: Date.now(),
        provider: selectedProvider, model: selectedModel,
      };

      const finalMsgs = [...msgs, assistantMsg];
      const finalUpdated = conversations.map(c => c.id === conv.id ? { ...c, messages: finalMsgs, updatedAt: Date.now() } : c);
      setConversations(finalUpdated); saveConversations(finalUpdated);
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: uid(), role: "assistant",
        content: `[Error] ${e instanceof Error ? e.message : "Request failed"}`,
        timestamp: Date.now(), provider: selectedProvider, model: selectedModel,
      };
      const withError = [...msgs, errorMsg];
      const updated2 = conversations.map(c => c.id === conv.id ? { ...c, messages: withError, updatedAt: Date.now() } : c);
      setConversations(updated2); saveConversations(updated2);
    }

    setSending(false);
    setShowReceipt(true);
  }, [reviewState, guardResult, composerText, attachedFiles, messages, conversations, selectedProvider, selectedModel, providerConfigs, ensureConversation]);

  // Simple send for new conversation
  const handleNewChat = useCallback(() => {
    setActiveConvId("");
    setComposerText("");
    setAttachedFiles([]);
    setReviewState("idle");
    setGuardResult(null);
  }, []);

  // Provider change
  const handleProviderChange = useCallback((prov: string) => {
    setSelectedProvider(prov);
    const cfg = providerConfigs.find(c => c.provider === prov);
    if (cfg) setSelectedModel(cfg.model || getDefaultModelForProvider(prov));
  }, [providerConfigs]);

  /* ============================================================
     Render
     ============================================================ */

  const canReview = (composerText.trim() || attachedFiles.length > 0) && !sending;
  const isConfigured = providerConfigs.some(c => c.provider === selectedProvider && c.enabled && c.apiKey);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* === Conversation List (Left) === */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: "1px solid var(--tf-border)",
        background: "var(--tf-sidebar-bg)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--tf-border)" }}>
          <button
            onClick={handleNewChat}
            className="tf-btn-primary"
            style={{ width: "100%", fontSize: "0.75rem", padding: "6px 10px" }}
          >
            + {tk("chat.newConversation")}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
          {conversations.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: "0.72rem", color: "var(--tf-text-muted)" }}>
              No conversations yet
            </div>
          ) : (
            [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).map(conv => (
              <div
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                style={{
                  padding: "8px 10px", borderRadius: "6px", cursor: "pointer",
                  marginBottom: 2,
                  background: conv.id === activeConvId ? "var(--tf-primary-soft)" : "transparent",
                  color: conv.id === activeConvId ? "var(--tf-primary-text)" : "var(--tf-text)",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {conv.title || "New conversation"}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--tf-text-muted)", marginTop: 2 }}>
                  {conv.messages.length} msgs &middot; {new Date(conv.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* === Chat Area (Center) === */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Provider bar */}
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid var(--tf-border)",
          background: "var(--tf-surface)", display: "flex", alignItems: "center", gap: 8,
          flexWrap: "wrap",
        }}>
          <select
            className="tf-select"
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            style={{ fontSize: "0.72rem", padding: "4px 24px 4px 8px" }}
          >
            {providerConfigs.map(c => (
              <option key={c.provider} value={c.provider}>{c.provider}</option>
            ))}
          </select>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: isConfigured ? "var(--tf-success)" : "var(--tf-text-muted)",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: "0.65rem", color: "var(--tf-text-muted)" }}>
            {isConfigured ? tk("common.configured") : tk("common.notConfigured")}
          </span>
          <span style={{ fontSize: "0.65rem", color: "var(--tf-text-muted)", marginLeft: "auto" }}>
            {selectedModel}
          </span>
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className="tf-btn-ghost tf-btn-sm"
            style={{ fontSize: "0.65rem" }}
          >
            {inspectorOpen ? "Hide Inspector" : "Show Inspector"}
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {messages.length === 0 ? (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: "var(--tf-text-muted)",
            }}>
              <div style={{ fontSize: "2rem", marginBottom: 12, opacity: 0.3 }}>
                <Shield size={48} />
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>
                TokenFence Safe Workspace
              </div>
              <div style={{ fontSize: "0.75rem" }}>
                Type a message and click Review to scan for sensitive content before sending.
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "75%",
                }}
              >
                <div style={{
                  padding: "10px 14px", borderRadius: "12px",
                  background: msg.role === "user" ? "var(--tf-primary)" : "var(--tf-surface-alt)",
                  color: msg.role === "user" ? "white" : "var(--tf-text)",
                  fontSize: "0.8rem", lineHeight: 1.5,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {msg.content}
                </div>
                {msg.guardResult?.flagged && (
                  <div style={{
                    fontSize: "0.6rem", color: "var(--tf-danger)",
                    marginTop: 2, textAlign: "right", fontWeight: 600,
                  }}>
                    <AlertTriangle size={10} style={{ display: "inline", marginRight: 3 }} />
                    {msg.guardResult.details}
                  </div>
                )}
                <div style={{ fontSize: "0.55rem", color: "var(--tf-text-muted)", marginTop: 2, textAlign: msg.role === "user" ? "right" : "left" }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                  {msg.provider && ` ? ${msg.provider}`}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div style={{
          borderTop: "1px solid var(--tf-border)",
          padding: "12px 16px",
          background: "var(--tf-surface)",
        }}>
          {/* Review status bar */}
          {reviewState === "reviewed" && guardResult && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", marginBottom: 8,
              borderRadius: "8px",
              background: guardResult.riskLevel === "safe"
                ? "var(--tf-success-soft)"
                : "var(--tf-warning-soft)",
              fontSize: "0.7rem", fontWeight: 600,
              color: guardResult.riskLevel === "safe"
                ? "var(--tf-success-text)"
                : "var(--tf-warning-text)",
            }}>
              <CheckCircle size={14} />
              {guardResult.riskLevel === "safe"
                ? "No sensitive content detected. Ready to send."
                : `${guardResult.findings.length} finding(s) detected. Review before sending.`}
            </div>
          )}
          {reviewState === "blocked" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", marginBottom: 8,
              borderRadius: "8px",
              background: "var(--tf-danger-soft)",
              fontSize: "0.7rem", fontWeight: 600,
              color: "var(--tf-danger-text)",
            }}>
              <AlertTriangle size={14} />
              Critical content detected. Sending blocked. Review the Safety Receipt.
            </div>
          )}

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {attachedFiles.map(f => (
                <div key={f.id} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: "6px",
                  background: "var(--tf-primary-soft)",
                  fontSize: "0.65rem", color: "var(--tf-primary-text)",
                }}>
                  <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  <button onClick={() => removeFile(f.id)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--tf-primary-text)", padding: 0,
                    display: "flex", alignItems: "center",
                  }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <button
              onClick={handleAttachFile}
              className="tf-btn-ghost tf-btn-sm"
              title="Attach file"
              style={{ flexShrink: 0 }}
            >
              <Paperclip size={16} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: "none" }}
              accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.py,.js,.ts,.rs,.go,.java,.c,.cpp,.h,.cs,.rb,.php,.swift,.kt,.env,.toml"
            />
            <textarea
              value={composerText}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey && canReview && reviewState === "idle") {
                  e.preventDefault(); handleReview();
                } else if (e.key === "Enter" && e.ctrlKey && reviewState === "reviewed") {
                  e.preventDefault(); handleApproveSend();
                }
              }}
              placeholder={isConfigured ? "Type a message... (Ctrl+Enter to review)" : "Configure a provider in Providers first"}
              rows={2}
              style={{
                flex: 1, resize: "none",
                padding: "8px 12px", borderRadius: "8px",
                border: "1px solid var(--tf-border)",
                background: "var(--tf-input-bg)",
                color: "var(--tf-text)",
                fontSize: "0.8rem", fontFamily: "var(--tf-font)",
                outline: "none",
              }}
            />
            {reviewState === "idle" ? (
              <button
                onClick={handleReview}
                disabled={!canReview}
                className="tf-btn-primary"
                style={{ flexShrink: 0, fontSize: "0.75rem", gap: 6 }}
              >
                <Shield size={14} />
                Review
              </button>
            ) : reviewState === "reviewed" ? (
              <button
                onClick={handleApproveSend}
                disabled={sending}
                className="tf-btn-primary"
                style={{ flexShrink: 0, fontSize: "0.75rem", gap: 6, background: "var(--tf-success)", borderColor: "var(--tf-success)" }}
              >
                {sending ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                Approve &amp; Send
              </button>
            ) : (
              <button
                onClick={() => { setReviewState("idle"); setGuardResult(null); setShowReceipt(false); }}
                className="tf-btn-secondary"
                style={{ flexShrink: 0, fontSize: "0.75rem" }}
              >
                Dismiss
              </button>
            )}
          </div>

          <div style={{ fontSize: "0.55rem", color: "var(--tf-text-muted)", marginTop: 4, textAlign: "right" }}>
            Ctrl+Enter to Review ? Review scans for sensitive data before sending
          </div>
        </div>
      </div>

      {/* === Safety Inspector (Right) === */}
      {inspectorOpen && (
        <div style={{
          width: 260, flexShrink: 0,
          borderLeft: "1px solid var(--tf-border)",
          background: "var(--tf-sidebar-bg)",
          overflowY: "auto",
          padding: 12,
        }}>
          <SafetyInspector result={guardResult} />
        </div>
      )}

      {/* === Safety Receipt Modal === */}
      {showReceipt && guardResult && (
        <SafetyReceipt
          result={guardResult}
          provider={selectedProvider}
          model={selectedModel}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
