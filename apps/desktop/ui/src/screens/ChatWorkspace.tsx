import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { tk } from "@tokenfence/shared/src/i18n";
import { ModelPickerPanel } from "../components/ModelPickerPanel";

import {

  PROVIDERS, PROVIDER_ENDPOINTS, type ProviderConfig,

  loadProviderConfigs, saveProviderConfigs,

  estimateTokens,

} from "@tokenfence/shared/src/providers";

import {

  MODEL_REGISTRY, getModelsForProvider, getModelById,

  getDefaultModelForProvider, findRoutingRule, searchModels,

  getStatusColor, getStatusLabel, getProviderIds,

  type ModelRegistryItem, type ModelStatus,

} from "@tokenfence/shared/src/model-registry";

import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";



/* ============================================================

   Types

   ============================================================ */



interface ChatMessage {

  id: string; role: "user" | "assistant" | "system"; content: string;

  timestamp: number; provider?: string; model?: string;

  guardResult?: { flagged: boolean; details: string };

}



interface Conversation {

  id: string; title: string; messages: ChatMessage[];

  createdAt: number; updatedAt: number;

}



interface AttachedFile {

  id: string; name: string; size: number; type: string; content: string;

}



type TaskStatus = "idle" | "scanning" | "preparing" | "waiting" | "responding" | "done" | "error";



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



function scanPrompt(text: string): { flagged: boolean; details: string } {

  const patterns = [

    { regex: /\b\d{16}\b/, label: "Potential credit card number" },

    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, label: "Email address" },

    { regex: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, label: "Potential SSN" },

    { regex: /\b(sk-[A-Za-z0-9]{20,})\b/, label: "Potential API key" },

  ];

  const hits: string[] = [];

  for (const p of patterns) { if (p.regex.test(text)) hits.push(p.label); }

  return { flagged: hits.length > 0, details: hits.length ? `Guard flagged: ${hits.join(", ")}` : "No sensitive data detected" };

}



async function callProviderAPI(

  messages: { role: string; content: string }[],

  config: ProviderConfig,

): Promise<string> {

  const ep = PROVIDER_ENDPOINTS[config.provider];

  if (!ep) return `[Error: Unknown provider "${config.provider}"]`;

  if (!config.apiKey && config.deployment === "cloud") {

    return `[Preview] Configure "${config.provider}" API key in Settings.`;

  }

  try {

    const mid = config.customModelId || config.model;

    const url = `${config.baseUrl || ep.baseUrl}${ep.chatEndpoint.replace("{model}", mid)}`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (config.apiKey) {

      if (config.provider === "Claude") { headers["x-api-key"] = config.apiKey; headers["anthropic-version"] = "2023-06-01"; }

      else if (config.provider === "Gemini") { headers["x-goog-api-key"] = config.apiKey; }

      else { headers["Authorization"] = `Bearer ${config.apiKey}`; }

    } else { return `[Preview] Configure "${config.provider}" API key.`; }

    let body: Record<string, unknown>;

    if (config.provider === "Claude") { body = { model: mid, max_tokens: 2048, messages: messages.map(m => ({ role: m.role, content: m.content })) }; }

    else if (config.provider === "Gemini") { body = { contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }; }

    else { body = { model: mid, messages, max_tokens: 2048 }; }

    const ctrl = new AbortController();

    const t = setTimeout(() => ctrl.abort(), 30000);

    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });

    clearTimeout(t);

    if (!resp.ok) { const e = await resp.text().catch(() => "Unknown"); return `[Error: ${resp.status}] ${e.slice(0, 300)}`; }

    const data = await resp.json();

    if (config.provider === "Claude") return data?.content?.[0]?.text ?? JSON.stringify(data).slice(0, 500);

    else if (config.provider === "Gemini") return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(data).slice(0, 500);

    else return data?.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 500);

  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e);

    if (msg.includes("abort") || msg.includes("timeout")) return "[Error: Request timeout]";

    return `[Error: ${msg.slice(0, 300)}]`;

  }

}



/* ============================================================

   Component

   ============================================================ */



export function ChatWorkspace() {

  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());

  const [activeConvId, setActiveConvId] = useState<string>("");

  const [composerText, setComposerText] = useState("");

  const [sending, setSending] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState("OpenAI");

  const [selectedModel, setSelectedModel] = useState("gpt-4o");

  const [guardEnabled, setGuardEnabled] = useState(true);

  const [lastGuardResult, setLastGuardResult] = useState<{ flagged: boolean; details: string } | null>(null);

  const [showRightPanel, setShowRightPanel] = useState(true);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");

  const [autoSwitchModel, setAutoSwitchModel] = useState(true);

  const [activeProject, setActiveProject] = useState<{id:string;name:string;folderPath:string;files:any[]}|null>(() => {

    try { const r = storeGet('tokenfence-active-project'); const ps = storeGet('tokenfence-projects');

      if (r && ps) { const projects = JSON.parse(ps); return projects.find((p:any)=>p.id===r)??null; }

    } catch { return null; }

    return null;

  });

  const [taskSteps, setTaskSteps] = useState<{id:string;label:string;status:'pending'|'running'|'done'|'error'}[]>([]);

  const [routingNote, setRoutingNote] = useState<string | null>(null);

  const [textInputMode, setTextInputMode] = useState(false);

  const [manualCalcText, setManualCalcText] = useState("");

  const [modelSearch, setModelSearch] = useState("");

  const [showModelPicker, setShowModelPicker] = useState(false);



  const composerRef = useRef<HTMLTextAreaElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickerRef = useRef<HTMLDivElement>(null);



  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  const providerConfigs = useMemo(() => loadProviderConfigs(), []);



  const getConfigFor = useCallback(

    (provider: string) => providerConfigs.find((c) => c.provider === provider),

    [providerConfigs],

  );



  const isProviderConfigured = useCallback(

    (provider: string) => !!(getConfigFor(provider)?.apiKey),

    [getConfigFor],

  );



  // Get models for current provider from registry

  const providerModels = useMemo(() => getModelsForProvider(selectedProvider), [selectedProvider]);



  // Filtered models based on search

  const filteredModels = useMemo(() => {

    if (!modelSearch.trim()) return providerModels;

    const q = modelSearch.toLowerCase();

    return providerModels.filter(m =>

      m.displayName.toLowerCase().includes(q) ||

      m.modelId.toLowerCase().includes(q) ||

      (m.alias && m.alias.toLowerCase().includes(q))

    );

  }, [providerModels, modelSearch]);



  // All searched models (cross-provider)

  const searchedModels = useMemo(() => {

    if (!modelSearch.trim() || modelSearch.trim().length < 2) return [];

    return searchModels(modelSearch);

  }, [modelSearch]);



  // Current model registry item

  const currentRegistryModel = useMemo(

    () => getModelById(selectedProvider, selectedModel) ?? providerModels[0],

    [selectedProvider, selectedModel, providerModels],

  );



  // Provider list from registry

  const providerIds = useMemo(() => getProviderIds(), []);



  useEffect(() => {

    if (conversations.length > 0 && !activeConvId) {

      setActiveConvId(conversations[0].id);

    }

  }, [conversations, activeConvId]);



  useEffect(() => {

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  }, [activeConv?.messages]);



  // Close picker on outside click

  useEffect(() => {

    const handler = (e: MouseEvent) => {

      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {

        setShowModelPicker(false);

        setModelSearch("");

      }

    };

    if (showModelPicker) document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);

  }, [showModelPicker]);



  /* ---- Token Budget ---- */



  const composerTokens = useMemo(() => estimateTokens(composerText), [composerText]);

  const attachedFilesTokens = useMemo(

    () => attachedFiles.reduce((sum, f) => sum + estimateTokens(f.content), 0),

    [attachedFiles],

  );

  const messageHistoryTokens = useMemo(() => {

    if (!activeConv) return 0;

    return activeConv.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  }, [activeConv]);



  const totalTokens = composerTokens + attachedFilesTokens + messageHistoryTokens;

  const contextLimit = currentRegistryModel?.contextWindow ?? 128000;

  const budgetRatio = totalTokens / contextLimit;

  const budgetColor = budgetRatio > 0.9 ? "var(--red)" : budgetRatio > 0.7 ? "var(--amber)" : "var(--text-secondary)";



  /* ---- file attach handlers ---- */



  const TEXT_EXTENSIONS = [".txt", ".md", ".json", ".csv", ".js", ".ts", ".tsx", ".py", ".html", ".css", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".log", ".env", ".sh", ".bat", ".ps1"];



  const handleFileAttach = useCallback(

    (e: React.ChangeEvent<HTMLInputElement>) => {

      const files = e.target.files;

      if (!files) return;

      const readers: Promise<AttachedFile>[] = [];

      for (let i = 0; i < files.length; i++) {

        const file = files[i];

        const ext = "." + file.name.split(".").pop()?.toLowerCase();

        const isText = TEXT_EXTENSIONS.includes(ext);

        readers.push(

          new Promise<AttachedFile>((resolve) => {

            if (isText) {

              const reader = new FileReader();

              reader.onload = () => resolve({ id: uid(), name: file.name, size: file.size, type: file.type || ext, content: reader.result as string });

              reader.onerror = () => resolve({ id: uid(), name: file.name, size: file.size, type: file.type || ext, content: `[Error reading: ${file.name}]` });

              reader.readAsText(file);

            } else {

              resolve({ id: uid(), name: file.name, size: file.size, type: file.type || ext, content: `[Binary file: ${file.name} (${file.size} bytes)]` });

            }

          }),

        );

      }

      Promise.all(readers).then((newFiles) => {

        setAttachedFiles((prev) => {

          const merged = [...prev, ...newFiles];

          if (autoSwitchModel && merged.length > 0) {

            const latestFile = newFiles[newFiles.length - 1];

            if (latestFile) {

              const rule = findRoutingRule(latestFile.name);

              if (rule) {

                const bestModel = MODEL_REGISTRY.find(m =>

                  (rule.preferredProviderId ? m.providerId === rule.preferredProviderId : true) &&

                  (rule.preferredModelId ? m.modelId === rule.preferredModelId : true) &&

                  m.capabilities.includes(rule.preferredCapability)

                ) ?? MODEL_REGISTRY.find(m =>

                  (rule.fallbackProviderId ? m.providerId === rule.fallbackProviderId : true) &&

                  (rule.fallbackModelId ? m.modelId === rule.fallbackModelId : true)

                );

                if (bestModel) {

                  setSelectedProvider(bestModel.providerId);

                  setSelectedModel(bestModel.modelId);

                  setRoutingNote(`Switched to ${bestModel.providerName} / ${bestModel.displayName} for ${rule.name}`);

                }

              }

            }

          }

          return merged;

        });

      });

      if (fileInputRef.current) fileInputRef.current.value = "";

    },

    [autoSwitchModel],

  );



  const handleRemoveFile = useCallback((fileId: string) => {

    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));

  }, []);



  const clearAttachedFiles = useCallback(() => {

    setAttachedFiles([]); setRoutingNote(null);

  }, []);



  /* ---- conversation handlers ---- */



  const handleNewConversation = useCallback(() => {

    const conv: Conversation = { id: uid(), title: tk("chat.newConversation"), messages: [], createdAt: Date.now(), updatedAt: Date.now() };

    const updated = [conv, ...conversations];

    setConversations(updated); setActiveConvId(conv.id);

    saveConversations(updated); setLastGuardResult(null); setTaskStatus("idle"); clearAttachedFiles();

  }, [conversations, clearAttachedFiles]);



  const handleClearConversation = useCallback(() => {

    if (!activeConv) return;

    const updated = conversations.map((c) => c.id === activeConvId ? { ...c, messages: [], updatedAt: Date.now() } : c);

    setConversations(updated); saveConversations(updated); setLastGuardResult(null); setTaskStatus("idle"); clearAttachedFiles();

  }, [activeConv, activeConvId, conversations, clearAttachedFiles]);



  const handleDeleteConversation = useCallback(

    (convId: string) => {

      const updated = conversations.filter((c) => c.id !== convId);

      setConversations(updated); saveConversations(updated);

      if (activeConvId === convId) setActiveConvId(updated.length > 0 ? updated[0].id : "");

    },

    [activeConvId, conversations],

  );



  const handleSelectModel = useCallback((providerId: string, modelId: string) => {

    setSelectedProvider(providerId); setSelectedModel(modelId);

    setShowModelPicker(false); setModelSearch("");

  }, []);



  /* ---- send message ---- */



  const sendMessage = useCallback(async () => {

    const text = composerText.trim();

    if (!text || sending) return;



    // Check if model is configured

    if (!isProviderConfigured(selectedProvider) && PROVIDERS.find(p => p.provider === selectedProvider)?.deployment === "cloud") {

      setRoutingNote(`Please configure API key for ${selectedProvider} before using ${selectedModel}.`);

      return;

    }



    setSending(true); setTaskStatus("scanning"); setRoutingNote(null);

    setTaskSteps([

      { id: 'scan', label: 'Scan prompt', status: 'running' },

      { id: 'prepare', label: 'Prepare context', status: 'pending' },

      { id: 'select', label: 'Select model', status: 'pending' },

      { id: 'send', label: 'Send to provider', status: 'pending' },

      { id: 'respond', label: 'Generate response', status: 'pending' },

      { id: 'save', label: 'Save conversation', status: 'pending' },

    ]);



    let guardResult: { flagged: boolean; details: string } | undefined;

    if (guardEnabled && activeConv) {

      guardResult = scanPrompt(text);

      setLastGuardResult(guardResult);

      if (guardResult.flagged) { setTaskStatus("idle"); setSending(false); return; }

    }



    setTaskStatus("preparing"); setTaskSteps(prev => prev.map(s => s.id==="scan" ? {...s,status:"done"} : s.id==="prepare" ? {...s,status:"running"} : s));

    let fullContent = text;

    if (attachedFiles.length > 0) {

      const fileContexts = attachedFiles.map((f) => {

        const preview = f.content.slice(0, 4000);

        return `[Attached: ${f.name}]\n${f.content.length > 4000 ? preview + "\n... [truncated]" : preview}`;

      });

      fullContent = fileContexts.join("\n\n") + "\n\n---\n\n" + text;

    }



    const userMsg: ChatMessage = { id: uid(), role: "user", content: fullContent, timestamp: Date.now(), provider: selectedProvider, model: selectedModel, guardResult };



    let targetConv = activeConv;

    if (!targetConv) {

      const newConv: Conversation = { id: uid(), title: text.slice(0, 60), messages: [], createdAt: Date.now(), updatedAt: Date.now() };

      const updated = [newConv, ...conversations];

      setConversations(updated); setActiveConvId(newConv.id); saveConversations(updated);

      targetConv = newConv;

    }



    const withUserMsg = { ...targetConv, messages: [...targetConv.messages, userMsg], updatedAt: Date.now() };

    const updatedConvs = conversations.map((c) => (c.id === targetConv!.id ? withUserMsg : c));

    if (!conversations.some((c) => c.id === targetConv!.id)) updatedConvs.unshift(withUserMsg);

    setConversations(updatedConvs); saveConversations(updatedConvs); setComposerText("");



    setTaskStatus("waiting"); setTaskSteps(prev => prev.map(s => s.id==="prepare" ? {...s,status:"done"} : s.id==="select" ? {...s,status:"running"} : s));

    const configs = loadProviderConfigs();

    const config = configs.find((c) => c.provider === selectedProvider) ?? { provider: selectedProvider, model: selectedModel, deployment: "cloud" } as ProviderConfig;



    const apiMessages: { role: string; content: string }[] = [];

    if (withUserMsg.messages.length === 1) apiMessages.push({ role: "system", content: "You are an AI assistant in TokenFence Studio. Be helpful and concise." });

    for (const m of withUserMsg.messages) apiMessages.push({ role: m.role, content: m.content });



    setTaskStatus("responding"); setTaskSteps(prev => prev.map(s => s.id==="select" ? {...s,status:"done"} : s.id==="send" ? {...s,status:"running"} : s));

    const responseText = await callProviderAPI(apiMessages, config);

    setTaskStatus("done"); setTaskSteps(prev => prev.map(s => s.id==="send" ? {...s,status:"done"} : s.id==="respond" ? {...s,status:"done"} : s.id==="save" ? {...s,status:"done"} : s));



    const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: responseText, timestamp: Date.now(), provider: selectedProvider, model: selectedModel };

    const finalConv = { ...withUserMsg, messages: [...withUserMsg.messages, assistantMsg], updatedAt: Date.now() };

    setConversations((prev) => { const next = prev.map((c) => (c.id === finalConv.id ? finalConv : c)); saveConversations(next); return next; });



    setSending(false);

    setTimeout(() => setTaskStatus("idle"), 2000);

  }, [composerText, sending, guardEnabled, activeConv, selectedProvider, selectedModel, conversations, attachedFiles, isProviderConfigured]);



  const handleKeyDown = useCallback(

    (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } },

    [sendMessage],

  );



  /* ---- misc ---- */



  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const contextPackTotalChars = attachedFiles.reduce((sum, f) => sum + f.content.length, 0);

  const manualCalcTokens = useMemo(() => estimateTokens(manualCalcText), [manualCalcText]);



  const taskStatusLabel: Record<TaskStatus, string> = {

    idle: tk("chat.idle"), scanning: tk("chat.scanning"), preparing: tk("chat.preparing"),

    waiting: tk("chat.waiting"), responding: tk("chat.responding"), done: tk("chat.done"), error: tk("chat.taskError"),

  };

  const stepLabels: Record<string,string> = { scan: "Scan prompt", prepare: "Prepare context", select: "Select model", send: "Send to provider", respond: "Generate response", save: "Save conversation" };



  const taskStatusColor: Record<TaskStatus, string> = {

    idle: "var(--text-muted)", scanning: "var(--amber)", preparing: "var(--amber)",

    waiting: "#2196f3", responding: "#9c27b0", done: "var(--green)", error: "var(--red)",

  };



  const isRunning = taskStatus !== "idle" && taskStatus !== "done" && taskStatus !== "error";



  /* ============================================================

     Render

     ============================================================ */



  return (

    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* Left: Conversations sidebar */}

      <div style={{ width: 220, minWidth: 220, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>

        <div style={{ padding: "12px", borderBottom: "1px solid var(--border)" }}>

          <button onClick={handleNewConversation} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px 12px", fontSize: "0.85rem" }}>

            + {tk("chat.newConversation")}

          </button>

        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>

          {sortedConversations.map((conv) => (

            <div key={conv.id} onClick={() => setActiveConvId(conv.id)}

              style={{ padding: "10px 12px", marginBottom: 2, borderRadius: "var(--radius)", cursor: "pointer",

                background: conv.id === activeConvId ? "var(--surface-alt)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center" }}>

              <div style={{ flex: 1, overflow: "hidden" }}>

                <div style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>

                  {conv.title || tk("chat.newConversation")}

                </div>

                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>{conv.messages.length} msgs</div>

              </div>

              <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}

                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: "2px 6px", opacity: 0.5 }}>x</button>

            </div>

          ))}

        </div>

        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: "0.65rem", color: "var(--text-muted)" }}>v1.0.11</div>

      </div>



      {/* Center: Chat area */}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}

        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>{activeConv?.title || tk("chat.newConversation")}</span>
            {/* Current model pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 10px", borderRadius: 14,
              background: "var(--surface-alt)", fontSize: "0.7rem",
              color: "var(--text-secondary)", border: "1px solid var(--border)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isProviderConfigured(selectedProvider) ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }}></span>
              <span>{selectedProvider} / {currentRegistryModel?.displayName ?? selectedModel}</span>
            </div>

          </div>

          <div style={{ display: "flex", gap: 8 }}>

            {/* Switch Model button */}
            <button
              onClick={() => setShowModelPicker(true)}
              className="btn btn-accent"
              style={{ fontSize: "0.75rem", padding: "5px 14px", fontWeight: 500 }}
            >
              {tk("chat.switchModel")}
            </button>

            {activeConv && activeConv.messages.length > 0 && (

              <button onClick={handleClearConversation} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "5px 10px" }}>{tk("chat.clearConversation")}</button>

            )}

            <button onClick={() => setShowRightPanel(!showRightPanel)} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "5px 10px" }}>

              {showRightPanel ? tk("chat.hideInspector") : tk("chat.showInspector")}

            </button>

          </div>

        </div>



        {/* Messages */}

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", background: "var(--bg)" }}>

          {(!activeConv || activeConv.messages.length === 0) && (

            <div style={{ padding: "60px 40px", textAlign: "center" }}>

              <div style={{ width: 64, height: 64, background: "var(--primary)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, color: "white" }}>TF</div>

              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>TokenFence Studio</h2>

              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>{tk("chat.welcome")}</p>

            </div>

          )}

          {routingNote && (

            <div style={{ padding: "10px 16px", background: "var(--surface-alt)", borderRadius: "var(--radius)", marginBottom: 16, fontSize: "0.8rem", color: "var(--text-secondary)", borderLeft: "3px solid var(--primary)" }}>{routingNote}</div>

          )}

          {activeConv?.messages.map((msg) => (

            <div key={msg.id} style={{ marginBottom: 20 }}>

              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 6, display: "flex", gap: 8 }}>

                <span style={{ fontWeight: 600, color: msg.role === "user" ? "var(--text-secondary)" : "var(--primary)" }}>{msg.role === "user" ? "You" : (msg.provider ?? "AI")}</span>

                <span style={{ marginLeft: "auto" }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>

              </div>

              <div style={{ padding: "12px 16px", borderRadius: "var(--radius-lg)", background: msg.role === "user" ? "var(--surface)" : "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "0.85rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>

              {msg.guardResult && <div style={{ fontSize: "0.7rem", color: msg.guardResult.flagged ? "var(--amber)" : "var(--green)", marginTop: 4 }}>{msg.guardResult.details}</div>}

            </div>

          ))}

          {sending && <div style={{ padding: "16px 20px", color: "var(--text-muted)", fontSize: "0.85rem" }}>{isRunning ? taskStatusLabel[taskStatus] : "..."}</div>}

          <div ref={messagesEndRef} />

        </div>



        {/* Active Project */}

      {activeProject && (

        <div style={{ padding: "6px 20px", background: "var(--surface-alt)", borderTop: "1px solid var(--border)", fontSize: "0.7rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>

          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }}></span>

          Project: <strong style={{ color: "var(--text-secondary)" }}>{activeProject.name}</strong>

          <span style={{ marginLeft: "auto" }}>{activeProject.files?.filter((f: any) => f.selected).length ?? 0} files in context</span>

        </div>

      )}

      {/* Composer */}

        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", background: "var(--surface)" }}>

          {attachedFiles.length > 0 && (

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>

              {attachedFiles.map((f) => (

                <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.7rem", color: "var(--text-secondary)" }}>

                  {f.name}

                  <button onClick={() => handleRemoveFile(f.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: 0, lineHeight: 1 }}>x</button>

                </span>

              ))}

            </div>

          )}



          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>

            {/* Current model indicator */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 14,
              background: "var(--surface-alt)", fontSize: "0.72rem",
              color: "var(--text-secondary)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isProviderConfigured(selectedProvider) ? "var(--green)" : "var(--text-muted)", flexShrink: 0 }}></span>
              <span>{selectedProvider} / {currentRegistryModel?.displayName ?? selectedModel}</span>
            </div>

            {/* Guard toggle */}

            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer" }}>

              <input type="checkbox" checked={guardEnabled} onChange={(e) => setGuardEnabled(e.target.checked)} /> {tk("nav.guard")}

            </label>



            {/* Auto-switch toggle */}

            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: autoSwitchModel ? "var(--primary)" : "var(--text-muted)", cursor: "pointer" }}>

              <input type="checkbox" checked={autoSwitchModel} onChange={(e) => setAutoSwitchModel(e.target.checked)} /> {tk("chat.autoSwitch")}

            </label>



            {/* File attach */}

            <input ref={fileInputRef} type="file" multiple onChange={handleFileAttach} style={{ display: "none" }}

              accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.toml,.ini,.cfg,.log,.env,.sh,.bat,.ps1,.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a" />

            <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "7px 12px" }}>

              {tk("chat.attachFile")}

            </button>

          </div>



          {/* Text area + send */}

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>

            <textarea ref={composerRef} value={composerText} onChange={(e) => setComposerText(e.target.value)} onKeyDown={handleKeyDown}

              placeholder={tk("chat.typeMessage")} disabled={sending} rows={3}

              style={{ flex: 1, background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", fontSize: "0.9rem", resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit" }} />

            <button onClick={sendMessage} disabled={sending || !composerText.trim()}

              className="btn btn-primary"

              style={{ padding: "12px 24px", fontSize: "0.9rem", fontWeight: 600, minWidth: 80, opacity: (sending || !composerText.trim()) ? 0.5 : 1 }}>

              {sending ? "..." : tk("chat.send")}

            </button>

          </div>

        </div>

      </div>



      {/* Right: Inspector */}

      {showRightPanel && (

        <div style={{ width: 260, minWidth: 260, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)", padding: "16px", overflowY: "auto" }}>

          {/* Token Budget */}

          <div onClick={() => setCollapsedSections((prev) => { const next = new Set(prev); if (next.has("budget")) next.delete("budget"); else next.add("budget"); return next; })}

            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>

            <h4 style={{ margin: 0, color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>{tk("chat.tokenBudget")}</h4>

            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{collapsedSections.has("budget") ? "▶" : "▼"}</span>

          </div>

          {!collapsedSections.has("budget") && (

            <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 6 }}>

                <span style={{ color: "var(--text-muted)" }}>{tk("chat.inputTokens")}</span>

                <span style={{ color: "var(--text-secondary)" }}>{composerTokens.toLocaleString()}</span>

              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 6 }}>

                <span style={{ color: "var(--text-muted)" }}>{tk("chat.fileTokens")}</span>

                <span style={{ color: "var(--text-secondary)" }}>{attachedFilesTokens.toLocaleString()}</span>

              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 8 }}>

                <span style={{ color: "var(--text-muted)" }}>{tk("chat.messageTokens")}</span>

                <span style={{ color: "var(--text-secondary)" }}>{messageHistoryTokens.toLocaleString()}</span>

              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600 }}>

                <span style={{ color: budgetColor }}>{tk("chat.totalTokens")}</span>

                <span style={{ color: budgetColor }}>{totalTokens.toLocaleString()} / {contextLimit >= 1000000 ? (contextLimit / 1000000).toFixed(1) + "M" : (contextLimit / 1000).toFixed(0) + "K"}</span>

              </div>

              {budgetRatio > 0.7 && (

                <div style={{ marginTop: 6, fontSize: "0.7rem", color: budgetColor, fontWeight: 500 }}>▶{tk("chat.budgetWarning")}</div>

              )}

              <div style={{ marginTop: 8 }}>

                <button onClick={(e) => { e.stopPropagation(); setTextInputMode(!textInputMode); }}

                  style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: "0.7rem", padding: 0 }}>

                  {textInputMode ? tk("chat.collapseDetails") : tk("chat.collapsedInfo")}

                </button>

                {textInputMode && (

                  <div style={{ marginTop: 6 }}>

                    <textarea value={manualCalcText} onChange={(e) => setManualCalcText(e.target.value)}

                      placeholder="Paste text..." rows={3}

                      style={{ width: "100%", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: "0.7rem", resize: "vertical", outline: "none" }}

                      onClick={(e) => e.stopPropagation()} />

                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>~{manualCalcTokens} tokens</div>

                  </div>

                )}

              </div>

            </div>

          )}



          {/* Agent Tasks */}

          <h4 style={{ margin: "12px 0 8px", color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>{tk("chat.agentTasks")}</h4>

          <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

            {taskSteps.length > 0 ? (

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

                {taskSteps.map(step => (

                  <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem" }}>

                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: step.status === "done" ? "var(--green)" : step.status === "running" ? "var(--primary)" : step.status === "error" ? "var(--red)" : "var(--text-muted)", display: "inline-block", flexShrink: 0 }}></span>

                    <span style={{ color: step.status === "done" ? "var(--green)" : step.status === "running" ? "var(--text)" : "var(--text-muted)" }}>{step.label}</span>

                  </div>

                ))}

              </div>

            ) : (

              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>

                <span style={{ width: 10, height: 10, borderRadius: "50%", background: taskStatusColor[taskStatus], display: "inline-block", flexShrink: 0 }}></span>

                <span style={{ fontSize: "0.8rem", color: taskStatusColor[taskStatus], fontWeight: 600 }}>{taskStatusLabel[taskStatus]}</span>

                {isRunning && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "auto" }}>▶</span>}

              </div>

            )}

          </div>

          {/* was: <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)", display: "flex", alignItems: "center", gap: 8 }}>

            <span style={{ width: 10, height: 10, borderRadius: "50%", background: taskStatusColor[taskStatus], display: "inline-block", flexShrink: 0 }}></span>

            <span style={{ fontSize: "0.8rem", color: taskStatusColor[taskStatus], fontWeight: 600 }}>{taskStatusLabel[taskStatus]}</span>

            {isRunning && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "auto" }}>▶</span>}

          </div>



          {/* Inspector collapsible */}

          <div onClick={() => setCollapsedSections((prev) => { const next = new Set(prev); if (next.has("inspector")) next.delete("inspector"); else next.add("inspector"); return next; })}

            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>

            <h4 style={{ margin: 0, color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>{tk("chat.inspector")}</h4>

            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{collapsedSections.has("inspector") ? "▶" : "▼"}</span>

          </div>

          {!collapsedSections.has("inspector") && (

            <>

              <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>{tk("chat.activeModel")}</div>

                <div style={{ fontSize: "0.8rem", color: "var(--text)", fontWeight: 500 }}>{selectedProvider} / {currentRegistryModel?.displayName ?? selectedModel}</div>

                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>

                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isProviderConfigured(selectedProvider) ? "var(--green)" : "var(--text-muted)" }}></span>

                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>

                    {isProviderConfigured(selectedProvider) ? tk("common.configured") : tk("common.notConfigured")}

                  </span>

                </div>

              </div>

              <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>{tk("chat.promptGuard")}</div>

                {lastGuardResult ? (

                  <div style={{ fontSize: "0.75rem", color: lastGuardResult.flagged ? "var(--amber)" : "var(--green)" }}>{lastGuardResult.flagged ? lastGuardResult.details : "No issues"}</div>

                ) : <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{tk("chat.sendMessageHint")}</div>}

              </div>

            </>

          )}



          {/* Context Pack */}

          <h4 style={{ margin: "12px 0 8px", color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>{tk("chat.contextPack")}</h4>

          <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

            {attachedFiles.length === 0 ? (

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{tk("chat.noFilesAttached")}</div>

            ) : (

              <>

                {attachedFiles.map((f) => (

                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: "0.7rem" }}>

                    <div style={{ flex: 1, overflow: "hidden" }}>

                      <div style={{ color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>

                      <div style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>{f.type} ·{(f.size / 1024).toFixed(1)} KB</div>

                    </div>

                    <button onClick={() => handleRemoveFile(f.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.7rem", padding: "2px 4px" }}>x</button>

                  </div>

                ))}

                <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 }}>

                  <div>{tk("chat.totalFiles")}: {attachedFiles.length}</div>

                  <div>{tk("chat.totalChars")}: {contextPackTotalChars.toLocaleString()}</div>

                  <div>{tk("chat.estimatedTokens")}: ~{attachedFilesTokens.toLocaleString()}</div>

                </div>

              </>

            )}

          </div>



          {attachedFiles.length > 0 && (

            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", padding: "4px 0" }}>

              {autoSwitchModel ? tk("chat.fileRoutingOn") : tk("chat.fileRoutingOff")}

            </div>

          )}

        </div>

      )}

    
      {/* Model Picker Modal */}
      <ModelPickerPanel
        isOpen={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        onSelect={(pid, mid) => { setSelectedProvider(pid); setSelectedModel(mid); }}
      />
</div>

  );

}

