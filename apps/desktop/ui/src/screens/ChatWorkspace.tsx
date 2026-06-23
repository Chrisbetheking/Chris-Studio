import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { tk, onLangChange } from "@tokenfence/shared/src/i18n";

import {

  PROVIDERS, PROVIDER_ENDPOINTS, type ProviderConfig,

  loadProviderConfigs, saveProviderConfigs,

  estimateTokens,

} from "@tokenfence/shared/src/providers";

import {
  MODEL_REGISTRY, getModelsForProvider, getModelById,
  getDefaultModelForProvider, findRoutingRule, searchModels,
  getStatusColor, getStatusLabel, getProviderIds,
  pickBestAvailableModel, addRecentModel,
  type ModelRegistryItem, type ModelStatus, type ModelPickReason,
} from "@tokenfence/shared/src/model-registry";

import { getEnabledModels, loadInstalledModels, type InstalledModel } from "@tokenfence/shared/src/installed-models";
import { readFile, scanProjectDirectory, pingTauri, type ProjectScanDebug } from "../desktop-bridge";
import { flattenFileTree, type ProjectFileNode } from "../data/project-file-tree";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";
import { RecentProjectsPanel } from "../components/RecentProjectsPanel";
import { ContextPackPanel } from "../components/ContextPackPanel";
import { addRecentProject } from "../data/project-workspace";
import { ModelPickerPanel } from "../components/ModelPickerPanel";
import { resolveActiveModel, setActiveModel, validateModelForSend, hasAnyConfiguredProvider, migrateActiveModelStorageV2, getActiveModelViewState, normalizeDisplayText, canonicalizeProviderId, getProviderDisplayName, dispatchActiveModelChanged, type ResolvedModelV2 } from "../data/active-model";



/* ============================================================

   Types

   ============================================================ */



interface ChatMessage {

  id: string; role: "user" | "assistant" | "system"; content: string;

  displayContent?: string;

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




function checkDeveloperIdentityQuestion(text: string): string | null {
  const isZh = tk("common.yes") !== "Yes";
  const zhPatterns = /开发者|谁开发的|作者|怎么联系|联系方式|客服|反馈.?bug|开发团队|团队开发/;
  const enPatterns = /who developed|who is the developer|who created|author of|contact developer|support email|wechat|bug report|development team/i;
  const zhMatch = zhPatterns.test(text);
  const enMatch = enPatterns.test(text);
  if (zhMatch || enMatch) {
    if (isZh) {
      return "TokenFence Studio 由 Chris 开发并维护。\n\n如果你遇到问题、想反馈 bug、提出功能建议，或者想联系开发者，可以通过以下方式联系：\n\n邮箱：chriswangjob@163.com\n微信：easymoneysniperchris";
    } else {
      return "TokenFence Studio is developed and maintained by Chris.\n\nIf you encounter issues, want to report bugs, request features, or contact the developer, please use:\n\nEmail: chriswangjob@163.com\nWeChat: easymoneysniperchris";
    }
  }
  return null;
}

interface SensitiveFinding {
  type: string;
  label: string;
  match: string;
  start: number;
  end: number;
}

function scanAndRedact(text: string): {
  flagged: boolean;
  sanitizedText: string;
  findings: SensitiveFinding[];
  details: string;
} {
  const MAX_SCAN_LENGTH = 8000;
  const MAX_FINDINGS = 20;
  const isZh = typeof tk === "function" && tk("common.yes") !== "Yes";

  const original = String(text || "");
  const scanText = original.slice(0, MAX_SCAN_LENGTH);

  // Safe patterns - all with /g flag, no catastrophic backtracking
  const patterns: { regex: RegExp; type: string; replacement: string }[] = [
    { regex: /\b1[3-9]\d{9}\b/g, type: "phoneNumber", replacement: "[" + (isZh ? "已隐藏：手机号" : "Redacted: phone") + "]" },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, type: "email", replacement: "[" + (isZh ? "已隐藏：邮箱" : "Redacted: email") + "]" },
    { regex: /\b(sk-[A-Za-z0-9_-]{8,})\b/g, type: "apiKey", replacement: "[" + (isZh ? "已隐藏：API key" : "Redacted: API key") + "]" },
    { regex: /\b(ghp_[A-Za-z0-9_]{8,})\b/g, type: "apiKey", replacement: "[" + (isZh ? "已隐藏：API key" : "Redacted: API key") + "]" },
    { regex: /\b(gho_[A-Za-z0-9_]{8,})\b/g, type: "apiKey", replacement: "[" + (isZh ? "已隐藏：API key" : "Redacted: API key") + "]" },
    { regex: /\b\d{16,19}\b/g, type: "bankCard", replacement: "[" + (isZh ? "已隐藏：银行卡" : "Redacted: bank card") + "]" },
    { regex: /\b\d{15,18}[0-9Xx]?\b/g, type: "idNumber", replacement: "[" + (isZh ? "已隐藏：身份证号" : "Redacted: ID number") + "]" },
    { regex: /\b(password|pwd)\s*[:=]\s*[^\s,;]{4,}/gi, type: "password", replacement: "$1=[" + (isZh ? "已隐藏：密码" : "Redacted: password") + "]" },
    { regex: /\b(token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]{6,}/gi, type: "token", replacement: "$1=[" + (isZh ? "已隐藏：token" : "Redacted: token") + "]" },
  ];

  // Phase 1: Collect findings from scanText
  const rawFindings: SensitiveFinding[] = [];
  for (const p of patterns) {
    if (rawFindings.length >= MAX_FINDINGS) break;
    let match;
    while ((match = p.regex.exec(scanText)) !== null) {
      if (rawFindings.length >= MAX_FINDINGS) break;
      rawFindings.push({
        type: p.type,
        label: p.type,
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Phase 2: Chinese ID context detection (safe string search, no regex backtracking)
  if (rawFindings.length < MAX_FINDINGS) {
    const idKeywords = ["身份证", "身份证号", "证件号", "身份号码", "ID", "idNumber", "ID Number"];
    for (const kw of idKeywords) {
      if (rawFindings.length >= MAX_FINDINGS) break;
      let idx = scanText.indexOf(kw);
      while (idx >= 0 && rawFindings.length < MAX_FINDINGS) {
        const windowStart = Math.max(0, idx - 5);
        const windowEnd = Math.min(scanText.length, idx + kw.length + 50);
        const window = scanText.slice(windowStart, windowEnd);
        const digitMatch = window.match(/\d{8,18}/);
        if (digitMatch) {
          const globalStart = windowStart + (digitMatch.index || 0);
          const dup = rawFindings.some(f => f.start === globalStart && f.type === "idNumber");
          if (!dup) {
            rawFindings.push({
              type: "idNumber",
              label: "idNumber",
              match: digitMatch[0],
              start: globalStart,
              end: globalStart + digitMatch[0].length,
            });
          }
        }
        idx = scanText.indexOf(kw, idx + 1);
      }
    }
  }

  // Phase 3: Deduplicate by start position, sort by start descending
  const seen = new Set<number>();
  const findings: SensitiveFinding[] = [];
  for (const f of rawFindings) {
    if (findings.length >= MAX_FINDINGS) break;
    if (!seen.has(f.start)) {
      seen.add(f.start);
      findings.push(f);
    }
  }
  findings.sort((a, b) => b.start - a.start);

  // Phase 4: Build sanitizedText by replacing from end to start
  let sanitizedText = original;
  for (const f of findings) {
    const pattern = patterns.find(p => p.type === f.type);
    const replacement = pattern ? pattern.replacement : "[" + (isZh ? "已隐藏" : "Redacted") + "]";
    const before = sanitizedText.slice(0, f.start);
    const after = sanitizedText.slice(f.end);
    sanitizedText = before + replacement + after;
  }

  const flagged = findings.length > 0;
  const details = flagged
    ? (isZh ? "检测到敏感数据，已自动脱敏" : "Sensitive data detected and redacted")
    : tk("chat.guardNoSensitive");

  return { flagged, sanitizedText, findings, details };
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
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);



  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());

  const [activeConvId, setActiveConvId] = useState<string>("");

  const [composerText, setComposerText] = useState("");

  const [sending, setSending] = useState(false);

  const [activeModel, setActiveModelState] = useState<ResolvedModelV2 | null>(() => { migrateActiveModelStorageV2(); return resolveActiveModel(); });

  const viewState = getActiveModelViewState();

  // Debug state for Self-Test verification
  (window as any).__TOKENFENCE_MODEL_RUNTIME__ = {
    headerLabel: viewState.displayLabel,
    inspectorLabel: viewState.displayLabel,
    sendTargetLabel: viewState.resolved?.displayLabel || viewState.displayLabel,
    viewState: viewState,
    hasRawUnicode: /\\u[0-9a-fA-F]{4}/.test(JSON.stringify(viewState)),
    updatedAt: Date.now(),
  };

  // Listen for external model changes (e.g. from Models page, Settings)
  useEffect(() => {
    const handler = () => {
      migrateActiveModelStorageV2();
      const resolved = resolveActiveModel();
      setActiveModelState(resolved);
    };
    window.addEventListener("tokenfence:active-model-changed", handler);
    return () => window.removeEventListener("tokenfence:active-model-changed", handler);
  }, []);

  const handleSetActiveModel = (providerId: string, modelId: string, displayName?: string) => {
    setActiveModel(providerId, modelId, displayName, "installed");
    const resolved = resolveActiveModel();
    setActiveModelState(resolved);
    // dispatchActiveModelChanged is now handled inside setActiveModel -> setActiveModelV2
  };

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

  const isZh = tk("common.yes") !== "Yes";
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>(() => getEnabledModels());
  const [projectTab, setProjectTab] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [projectFileTree, setProjectFileTree] = useState<ProjectFileNode[]>([]);
  const [isScanningProject, setIsScanningProject] = useState(false);
  const [projectScanStatus, setProjectScanStatus] = useState<"idle"|"scanning"|"done"|"done_empty"|"failed">("idle");
  const [projectScanError, setProjectScanError] = useState<string | null>(null);
  const [scanDebug, setScanDebug] = useState<ProjectScanDebug | null>(null);
  const [scanPingResult, setScanPingResult] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<string>("Desktop/Tauri");
  const [projectSearchQ, setProjectSearchQ] = useState("");
  const [savedProjects, setSavedProjects] = useState<any[]>(() => {
    try { const ps = storeGet("tokenfence-projects"); return ps ? JSON.parse(ps) : []; } catch { return []; }
  });

  const handleLoadManualPath = async () => {
    const path = manualPath.trim();
    if (!path) return;
    console.log("[ProjectScan] load path", path);

    const name = path.split("\\").pop() || path.split("/").pop() || path;
    const proj = { id: "manual-" + Date.now(), name, folderPath: path, files: [] };
    setActiveProject(proj);
    const updated = [proj, ...savedProjects.filter((p: any) => p.folderPath !== path)];
    setSavedProjects(updated);
    try {
      storeSet("tokenfence-active-project", proj.id);
      storeSet("tokenfence-projects", JSON.stringify(updated));
    } catch (_) {}

    setIsScanningProject(true);
    setProjectScanStatus("scanning");
    setProjectScanError(null);
    setProjectFileTree([]);
    setScanPingResult(null);
    setScanSource("Desktop/Tauri");

    // Phase 1: ping Tauri to confirm bridge is alive
    try {
      const pong = await pingTauri();
      setScanPingResult(pong);
    } catch (pingErr: any) {
      const msg = pingErr instanceof Error ? pingErr.message : String(pingErr);
      setScanPingResult("FAILED: " + msg);
      setScanSource("Bridge failed");
      setProjectScanStatus("failed");
      setProjectScanError("Tauri ping failed: " + msg);
      setIsScanningProject(false);
      return;
    }

    // Phase 2: scan project directory
    try {
      const result = await scanProjectDirectory(path);
      console.log("[ProjectScan] result debug:", JSON.stringify(result.debug));
      setScanDebug(result.debug);

      if (result.debug.error) {
        setScanSource("Bridge failed");
        setProjectScanStatus("failed");
        setProjectScanError("scan_project_directory failed: " + result.debug.error);
        return;
      }

      const safeTree = Array.isArray(result.nodes) ? result.nodes : [];
      setProjectFileTree(safeTree);

      if (safeTree.length > 0) {
        setScanSource("Desktop/Tauri");
        setProjectScanStatus("done");
        const flat = flattenFileTree(safeTree);
        const fileEntries = flat.filter((n: ProjectFileNode) => n.type === "file").map((n: ProjectFileNode) => ({
          name: n.relativePath || n.name,
          path: n.path,
          size: n.sizeBytes || 0,
          selected: false,
        }));
        setActiveProject((prev: any) => prev ? { ...prev, files: fileEntries } : prev);
      } else {
        setScanSource("Desktop/Tauri");
        setProjectScanStatus("done_empty");
        setProjectScanError("Rust scanner returned 0 nodes.");
      }
    } catch (e: any) {
      console.error("[ProjectScan] error", e && e.message ? e.message : String(e));
      setScanSource("Bridge failed");
      setProjectScanStatus("failed");
      setProjectScanError("scan_project_directory invoke failed: " + (e && e.message ? e.message : "Scan failed"));
    } finally {
      setIsScanningProject(false);
    }
  };

  const [sidebarTab, setSidebarTab] = useState<"conversations" | "project">("conversations");
  const [dragOver, setDragOver] = useState(false);



  const composerRef = useRef<HTMLTextAreaElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);



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

  const hasConfigured = useMemo(() => hasAnyConfiguredProvider(), [providerConfigs]);

  // Get models for current provider from registry

  const providerModels = useMemo(() => getModelsForProvider(activeModel?.providerId || ""), [activeModel]);







  // Current model registry item

  const currentRegistryModel = useMemo(

    () => getModelById(viewState.providerLabel, viewState.modelLabel) ?? providerModels[0],

    [viewState.providerLabel, viewState.modelLabel, providerModels],

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

                  handleSetActiveModel(bestModel.providerId, bestModel.modelId);


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

    setConversations(updated); saveConversations(updated); setLastGuardResult(null); setTaskStatus("idle"); clearAttachedFiles(); setSending(false);

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

    handleSetActiveModel(providerId, modelId);

    setShowModelPanel(false);

  }, []);



  /* ---- send message ---- */



  const sendMessage = useCallback(async () => {

    const text = composerText.trim();

    if (!text || sending) return;



    setSending(true); setTaskStatus("scanning"); setRoutingNote(null);
    try {

    setTaskSteps([
      { id: 'scan', label: tk("chat.agentStepScan"), status: 'running' },
      { id: 'prepare', label: tk("chat.agentStepPrepare"), status: 'pending' },
      { id: 'select', label: tk("chat.agentStepSelect"), status: 'pending' },
      { id: 'send', label: tk("chat.agentStepSend"), status: 'pending' },
      { id: 'respond', label: tk("chat.agentStepRespond"), status: 'pending' },
      { id: 'save', label: tk("chat.agentStepSave"), status: 'pending' },
    ]);



    let guardResult: { flagged: boolean; details: string } | undefined;
    let redactResult: ReturnType<typeof scanAndRedact> | undefined;

    if (guardEnabled) {

      const devCheck = checkDeveloperIdentityQuestion(text);
      if (devCheck && activeConv) {
        const devMsg = { id: uid(), role: "assistant", content: devCheck, timestamp: Date.now() };
        const devConv = { ...activeConv, messages: [...activeConv.messages, devMsg], updatedAt: Date.now() };
        const devConvs = conversations.map(function(c) { return c.id === activeConv.id ? devConv : c; });
        setConversations(devConvs); saveConversations(devConvs);
        setComposerText("");
        return;
      }
      redactResult = scanAndRedact(text); guardResult = { flagged: redactResult.flagged, details: redactResult.details };

      setLastGuardResult(guardResult);

    }



    setTaskStatus("preparing"); setTaskSteps(prev => prev.map(s => s.id==="scan" ? {...s,status:"done"} : s.id==="prepare" ? {...s,status:"running"} : s));

    let fullContent = redactResult?.sanitizedText ?? text;

    if (attachedFiles.length > 0) {

      const fileContexts = attachedFiles.map((f) => {

        const preview = f.content.slice(0, 4000);

        return `[Attached: ${f.name}]\n${f.content.length > 4000 ? preview + "\n... [truncated]" : preview}`;

      });

      fullContent = fileContexts.join("\n\n") + "\n\n---\n\n" + text;

    }



    const userMsg: ChatMessage = { id: uid(), role: "user", content: fullContent, timestamp: Date.now(), provider: viewState.providerLabel, model: viewState.modelLabel, guardResult, displayContent: redactResult?.flagged ? text : undefined };



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

    // Pre-send validation
    const validation = validateModelForSend();
    if (!validation.valid) {
      setRoutingNote(validation.errorEn);
      setSending(false); setTaskStatus("error");
      return;
    }

    const config = configs.find((c) => c.provider === (activeModel?.providerId ?? viewState.providerLabel)) ?? { provider: (activeModel?.providerId ?? viewState.providerLabel), model: viewState.modelLabel, deployment: "cloud" } as ProviderConfig;



    const apiMessages: { role: string; content: string }[] = [];

    if (withUserMsg.messages.length === 1) apiMessages.push({ role: "system", content: (isZh ? "你是 TokenFence Studio 内置助手。TokenFence Studio 由 Chris 开发并维护。如果你遇到问题、想反馈 bug、提出功能建议，或者想联系开发者，可以通过以下方式联系：邮箱 chriswangjob@163.com，微信 easymoneysniperchris。请提供有帮助且简洁的回复。" : "You are an AI assistant in TokenFence Studio. TokenFence Studio is developed and maintained by Chris. If you encounter issues, want to report bugs, request features, or contact the developer, please email chriswangjob@163.com or use WeChat: easymoneysniperchris. Be helpful and concise.") });

    for (const m of withUserMsg.messages) apiMessages.push({ role: m.role, content: m.content });



    setTaskStatus("responding"); setTaskSteps(prev => prev.map(s => s.id==="select" ? {...s,status:"done"} : s.id==="send" ? {...s,status:"running"} : s));

    const resolvedForSend = resolveActiveModel();
    const usedModel = resolvedForSend?.modelId ?? config.model ?? "";
    const usedProvider = resolvedForSend?.providerId ?? config.provider ?? "";
    const responseText = await callProviderAPI(apiMessages, { ...config, model: usedModel });

    setTaskStatus("done"); setTaskSteps(prev => prev.map(s => s.id==="send" ? {...s,status:"done"} : s.id==="respond" ? {...s,status:"done"} : s.id==="save" ? {...s,status:"done"} : s));



    const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: responseText, timestamp: Date.now(), provider: usedProvider, model: usedModel };

    const finalConv = { ...withUserMsg, messages: [...withUserMsg.messages, assistantMsg], updatedAt: Date.now() };

    setConversations((prev) => { const next = prev.map((c) => (c.id === finalConv.id ? finalConv : c)); saveConversations(next); return next; });


    } finally {
      setSending(false);
      setTimeout(() => setTaskStatus("idle"), 2000);
    }
  }, [composerText, sending, guardEnabled, activeConv, viewState.providerLabel, viewState.modelLabel, conversations, attachedFiles, isProviderConfigured]);



  const handleKeyDown = useCallback(

    (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } },

    [sendMessage],

  );





/* ============================================================
   ProjectFilePanel Component
   ============================================================ */

interface ProjectFilePanel {
  activeProject: { id: string; name: string; folderPath: string; files: any[] } | null;
  setActiveProject: React.Dispatch<React.SetStateAction<{ id: string; name: string; folderPath: string; files: any[] } | null>>;
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  onClose: () => void;
}

function ProjectFilePanel({ activeProject, setActiveProject, attachedFiles, setAttachedFiles, onClose }: ProjectFilePanel) {
  const [searchQ, setSearchQ] = useState("");
  const [projects, setProjects] = useState<any[]>(() => {
    try { const ps = storeGet("tokenfence-projects"); return ps ? JSON.parse(ps) : []; } catch { return []; }
  });

  const filteredFiles = useMemo(() => {
    if (!activeProject?.files) return [];
    if (!searchQ.trim()) return activeProject.files;
    const q = searchQ.toLowerCase();
    return activeProject.files.filter((f: any) => f.name.toLowerCase().includes(q));
  }, [activeProject?.files, searchQ]);



  const selectedFileCount = useMemo(() => {
    return activeProject?.files?.filter((f: any) => f.selected).length ?? 0;
  }, [activeProject?.files]);

  const projectFilesInContext = useMemo(() => {
    return attachedFiles.filter((f) => f.type === "project");
  }, [attachedFiles]);

  const toggleProjectFileSelection = (fileName: string) => {
    if (!activeProject) return;
    const updated = {
      ...activeProject,
      files: activeProject.files.map((f: any) =>
        f.name === fileName ? { ...f, selected: !f.selected } : f
      ),
    };
    setActiveProject(updated);
    try { storeSet("tokenfence-active-project", updated.id); storeSet("tokenfence-projects", JSON.stringify(savedProjects.map((p: any) => p.id === updated.id ? updated : p))); } catch {}
  };


  const handleLoadSavedProject = (proj: any) => {
    setActiveProject(proj);
    try { storeSet("tokenfence-active-project", proj.id); } catch {}
  };

  const handleAddSelectedToContext = async () => {
    if (!activeProject) return;
    const selected = activeProject.files?.filter((f: any) => f.selected) ?? [];
    for (const f of selected) {
      let content = `[Project: ${activeProject.name}]
[File: ${f.name}]

`;
      try {
        const filePath = activeProject.folderPath + "\\" + f.name;
        const fileContent = await readFile(filePath);
        content += fileContent || "(empty file)";
      } catch {
        content += "(unable to read file)";
      }
      setAttachedFiles((prev) => {
        if (prev.find((x) => x.name === f.name && x.type === "project")) return prev;
        return [...prev, { id: `proj-${f.name}`, name: f.name, size: content.length, type: "project", content }];
      });
    }
  };

  const handleRemoveAllProjectContext = () => {
    setAttachedFiles((prev) => prev.filter((f) => f.type !== "project"));
  };

  const toggleFile = async (fileName: string) => {
    if (!activeProject) return;
    const updated = {
      ...activeProject,
      files: activeProject.files.map((f: any) =>
        f.name === fileName ? { ...f, selected: !f.selected } : f
      ),
    };
    setActiveProject(updated);
    try { storeSet("tokenfence-active-project", updated.id); storeSet("tokenfence-projects", JSON.stringify(projects.map((p: any) => p.id === updated.id ? updated : p))); } catch {}

    // Update Context Pack
    const wasSelected = activeProject.files.find((f: any) => f.name === fileName)?.selected;
    if (!wasSelected) {
      // Add to context with real file content
      let content = `[Project: ${activeProject.name}]\n[File: ${fileName}]\n\n`;
      try {
        const filePath = activeProject.folderPath + "\\" + fileName;
        const fileContent = await readFile(filePath);
        content += fileContent || "(empty file)";
      } catch {
        content += "(unable to read file)";
      }
      setAttachedFiles((prev) => {
        if (prev.find((f) => f.name === fileName && f.type === "project")) return prev;
        return [...prev, { id: `proj-${fileName}`, name: fileName, size: content.length, type: "project", content }];
      });
    } else {
      // Remove from context
      setAttachedFiles((prev) => prev.filter((f) => f.name !== fileName || f.type !== "project"));
    }
  };

  const toggleAllFiles = async (select: boolean) => {
    if (!activeProject) return;
    const updated = {
      ...activeProject,
      files: activeProject.files.map((f: any) => ({ ...f, selected: select })),
    };
    setActiveProject(updated);
    try { storeSet("tokenfence-projects", JSON.stringify(projects.map((p: any) => p.id === updated.id ? updated : p))); } catch {}
    if (select) {
      const newFiles: any[] = [];
      for (const f of activeProject.files) {
        let content = `[Project: ${activeProject.name}]\n[File: ${f.name}]\n\n`;
        try {
          const filePath = activeProject.folderPath + "\\" + f.name;
          const fileContent = await readFile(filePath);
          content += fileContent || "(empty file)";
        } catch {
          content += "(unable to read file)";
        }
        newFiles.push({ id: `proj-${f.name}`, name: f.name, size: content.length, type: "project", content });
      }
      setAttachedFiles((prev) => {
        const existing = new Set(prev.filter((f) => f.type === "project").map((f) => f.name));
        return [...prev.filter((f) => f.type !== "project"), ...newFiles.filter((f) => !existing.has(f.name))];
      });
    } else {
      setAttachedFiles((prev) => prev.filter((f) => f.type !== "project"));
    }
  };

  if (!activeProject) {
    const storedActive = (() => { try { const r = storeGet("tokenfence-active-project"); if (r && projects.length > 0) { const p = projects.find((p: any) => p.id === r); if (p) return p; } } catch {} return null; })();
    if (storedActive) { setActiveProject(storedActive); return null; }

    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{tk("common.projects")}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem" }}>&times;</button>
        </div>
        {projects.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
            {tk("common.noProjects")}
          </div>
        ) : (
          projects.map((p: any) => (
            <div key={p.id} onClick={() => setActiveProject(p)} className="card" style={{ padding: "10px 12px", marginBottom: 6, cursor: "pointer", fontSize: "0.8rem" }}>
              <div style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>{p.files?.length ?? 0} files</div>
            </div>
          ))
        )}
      </div>
    );
  }

  const selectedCount = activeProject.files?.filter((f: any) => f.selected).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }}></span>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{activeProject.name}</span>
          </div>
          <button onClick={() => { setActiveProject(null); onClose(); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem" }}>&times;</button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => toggleAllFiles(true)} className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "3px 8px" }}>{tk("common.allFiles")}</button>
          <button onClick={() => toggleAllFiles(false)} className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "3px 8px" }}>{tk("common.noneFiles")}</button>
          <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", alignSelf: "center" }}>{selectedCount} selected</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={tk("chat.searchFiles") || "Search files..."}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: "0.75rem", outline: "none" }}
        />
      </div>

      {/* File tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {filteredFiles.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
            {searchQ.trim() ? tk("chat.noFilesFound") || "No matching files" : tk("chat.noFiles") || "No files"}
          </div>
        ) : (
          filteredFiles.map((f: any) => {
            const isSelected = f.selected;
            const inContext = attachedFiles.some((af) => af.name === f.name && af.type === "project");
            return (
              <div
                key={f.name}
                onClick={() => toggleFile(f.name)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 16px", cursor: "pointer",
                  background: isSelected ? "var(--accent-faint, rgba(79,140,255,0.08))" : "transparent",
                  fontSize: "0.78rem",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface-alt)"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>{String.fromCodePoint(0x1F4C4)}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "var(--primary)" : "var(--text)" }}>{f.name}</span>
                {inContext && (
                  <span style={{ fontSize: "0.6rem", background: "var(--primary)", color: "white", padding: "1px 5px", borderRadius: 8, flexShrink: 0 }}>CTX</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


  /* ---- Drag & Drop upload ---- */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const readers: Promise<{ id: string; name: string; size: number; type: string; content: string }>[] = [];
    files.forEach((file) => {
      readers.push(new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ id: uid(), name: file.name, size: file.size, type: file.type, content: reader.result as string });
        reader.onerror = () => resolve({ id: uid(), name: file.name, size: file.size, type: file.type, content: "" });
        reader.readAsText(file);
      }));
    });
    Promise.all(readers).then((results) => {
      setAttachedFiles((prev) => [...prev, ...results]);
    });
  }, []);


  /* ---- misc ---- */



  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const contextPackTotalChars = attachedFiles.reduce((sum, f) => sum + f.content.length, 0);

  const manualCalcTokens = useMemo(() => estimateTokens(manualCalcText), [manualCalcText]);



  const taskStatusLabel: Record<TaskStatus, string> = {

    idle: tk("chat.idle"), scanning: tk("chat.scanning"), preparing: tk("chat.preparing"),

    waiting: tk("chat.waiting"), responding: tk("chat.responding"), done: tk("chat.done"), error: tk("chat.taskError"),

  };

  const stepLabels: Record<string,string> = { scan: tk("chat.agentStepScan"), prepare: tk("chat.agentStepPrepare"), select: tk("chat.agentStepSelect"), send: tk("chat.agentStepSend"), respond: tk("chat.agentStepRespond"), save: tk("chat.agentStepSave") };



  const taskStatusColor: Record<TaskStatus, string> = {

    idle: "var(--text-muted)", scanning: "var(--amber)", preparing: "var(--amber)",

    waiting: "#2196f3", responding: "#9c27b0", done: "var(--green)", error: "var(--red)",

  };



  const isRunning = taskStatus !== "idle" && taskStatus !== "done" && taskStatus !== "error";



  /* ============================================================

     Render

     ============================================================ */



  return (

    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)", position: "relative" }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

        {/* Drag & Drop overlay */}
        {dragOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(79,140,255,0.15)", backdropFilter: "blur(4px)", border: "3px dashed var(--primary)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, pointerEvents: "none" }}>
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "32px 48px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>{String.fromCodePoint(0x1F4C2)}</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>{tk("chat.dropFilesHere") || "Drop files here"}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>{tk("chat.addToContextPack") || "Add to Context Pack"}</div>
            </div>
          </div>
        )}


      {/* Left: Conversations sidebar */}

      <div style={{ width: 220, minWidth: 220, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>

        {/* Sidebar tabs: Conversations / Project */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setSidebarTab("conversations")}
            style={{
              flex: 1, padding: "10px 8px", fontSize: "0.78rem", fontWeight: sidebarTab === "conversations" ? 600 : 400,
              color: sidebarTab === "conversations" ? "var(--primary)" : "var(--text-muted)",
              background: "none", border: "none", borderBottom: sidebarTab === "conversations" ? "2px solid var(--primary)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {isZh ? "\u5BF9\u8BDD" : "Conversations"}
          </button>
          <button
            onClick={() => setSidebarTab("project")}
            style={{
              flex: 1, padding: "10px 8px", fontSize: "0.78rem", fontWeight: sidebarTab === "project" ? 600 : 400,
              color: sidebarTab === "project" ? "var(--primary)" : "var(--text-muted)",
              background: "none", border: "none", borderBottom: sidebarTab === "project" ? "2px solid var(--primary)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {isZh ? "\u9879\u76EE" : "Project"}
          </button>
        </div>

        {/* Conversations tab */}
        {sidebarTab === "conversations" && (
          <>
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

        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: "0.65rem", color: "var(--text-muted)" }}>{conversations.length} {isZh ? "个会话" : "conversations"}</div>
          </>
        )}

        {/* Project tab */}
        {sidebarTab === "project" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {/* Active Project */}
            {activeProject ? (
              <div style={{ padding: "8px", background: "var(--surface-alt)", borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>{isZh ? "当前项目" : "Active Project"}</div>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)" }}>{activeProject.name}</div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 2, wordBreak: "break-all" }}>{activeProject.folderPath}</div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>{activeProject.files?.length ?? 0} {isZh ? "个文件" : "files"}</div>
              </div>
            ) : (
              <div style={{ padding: "8px", color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginBottom: 10 }}>
                {isZh ? "未加载项目" : "No project loaded"}
              </div>
            )}

            {/* Manual Path input */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>{isZh ? "手动路径" : "Manual Path"}</div>
              <input
                className="input"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder={isZh ? "输入项目路径..." : "Enter project path..."}
                style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: "0.7rem", outline: "none" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleLoadManualPath(); }}
              />
            </div>

            <button onClick={handleLoadManualPath} className="btn btn-primary" style={{ width: "100%", fontSize: "0.75rem", padding: "6px 12px", marginBottom: 10 }}>
              {isZh ? "加载项目" : "Load Project"}
            </button>
            {/* Scan diagnostics */}
            {projectScanStatus !== "idle" && (
              <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", marginBottom: 8, padding: "6px 8px", background: "var(--surface-alt)", borderRadius: 4, lineHeight: 1.6 }}>
                <div><strong>Source:</strong> {scanSource}</div>
                {scanPingResult && <div><strong>Tauri ping:</strong> {scanPingResult}</div>}
                <div><strong>Status:</strong> {projectScanStatus}</div>
                {scanDebug && (
                  <div>
                    <div><strong>Path:</strong> {scanDebug.path}</div>
                    <div><strong>Exists:</strong> {String(scanDebug.exists)} | <strong>Is Dir:</strong> {String(scanDebug.isDir)}</div>
                    <div><strong>Read dir count:</strong> {scanDebug.readDirCount}</div>
                    <div><strong>Raw entries:</strong> {scanDebug.readDirCount}</div>
                    <div><strong>Top nodes:</strong> {scanDebug.returnedTopNodes}</div>
                    <div><strong>Flat nodes:</strong> {scanDebug.returnedFlatNodes}</div>
                    <div><strong>Files:</strong> {scanDebug.returnedFiles}</div>
                    <div><strong>Dirs:</strong> {scanDebug.returnedDirs}</div>
                    {scanDebug.firstEntries.length > 0 && <div><strong>First entries:</strong> {scanDebug.firstEntries.slice(0, 10).join(", ")}</div>}
                    {scanDebug.firstNodes.length > 0 && <div><strong>First nodes:</strong> {scanDebug.firstNodes.join(", ")}</div>}
                    {scanDebug.error && <div style={{ color: "var(--danger, #e00)" }}><strong>Error:</strong> {scanDebug.error}</div>}
                    {scanDebug.readDirCount > 0 && scanDebug.returnedTopNodes === 0 && (
                      <div style={{ color: "var(--warning, orange)" }}>Rust read the directory but filtered out all entries.</div>
                    )}
                    {scanDebug.returnedTopNodes > 0 && scanDebug.returnedFiles === 0 && (
                      <div style={{ color: "var(--warning, orange)" }}>Scanner returned nodes, but UI flattening produced 0 files.</div>
                    )}
                  </div>
                )}
                {projectScanError && <div style={{ color: "var(--danger, #e00)" }}><strong>Error:</strong> {projectScanError}</div>}
              </div>
            )}

            {/* Recent Projects */}
            <RecentProjectsPanel />
            <div style={{ marginTop: 8 }}><ContextPackPanel compact /></div>

            {/* Active project file tree */}
            {activeProject && (
              <>
                {/* Search */}
                <div style={{ marginBottom: 6 }}>
                  <input
                    className="input"
                    value={projectSearchQ}
                    onChange={(e) => setProjectSearchQ(e.target.value)}
                    placeholder={isZh ? "搜索文件..." : "Search files..."}
                    style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", fontSize: "0.7rem", outline: "none" }}
                  />
                </div>

                {/* File tree */}
                <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 6 }}>
                  {activeProject.files.filter((f) => !projectSearchQ.trim() || f.name.toLowerCase().includes(projectSearchQ.toLowerCase())).length === 0 ? (
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", padding: 8 }}>
                      {projectSearchQ.trim() ? (isZh ? "无匹配文件" : "No matching files") : (isZh ? "无文件" : "No files")}
                    </div>
                  ) : (
                    activeProject.files.filter((f) => !projectSearchQ.trim() || f.name.toLowerCase().includes(projectSearchQ.toLowerCase())).map((f) => (
                      <div
                        key={f.name}
                        onClick={() => { if (!activeProject) return; const upd = { ...activeProject, files: activeProject.files.map((pf) => pf.name === f.name ? { ...pf, selected: !pf.selected } : pf) }; setActiveProject(upd); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 6px", cursor: "pointer", borderRadius: 4, fontSize: "0.72rem",
                          background: f.selected ? "var(--accent-faint, rgba(79,140,255,0.1))" : "transparent",
                          color: f.selected ? "var(--primary)" : "var(--text)",
                        }}
                      >
                        <span style={{ fontSize: "0.6rem", flexShrink: 0 }}>{f.selected ? "●" : "○"}</span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Selected count + actions */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    {activeProject?.files?.filter((sf) => sf.selected).length ?? 0} {isZh ? "已选择" : "selected"}
                  </span>
                  <button onClick={() => { if (!activeProject) return; const sel = activeProject.files?.filter((sf) => sf.selected) ?? []; for (const sf of sel) { setAttachedFiles((prev) => { if (prev.find((x) => x.name === sf.name && x.type === "project")) return prev; return [...prev, { id: `proj-${sf.name}`, name: sf.name, size: 0, type: "project", content: `[Project: ${activeProject.name}]
[File: ${sf.name}]` }]; }); } }} className="btn btn-primary" style={{ fontSize: "0.68rem", padding: "4px 10px" }}>
                    {isZh ? "加入上下文" : "Add to Context"}
                  </button>
                  {attachedFiles.filter((f) => f.type === "project").length > 0 && (
                    <button onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.type !== "project"))} className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "4px 10px", color: "var(--red)" }}>
                      {isZh ? "清除项目上下文" : "Clear Project Context"}
                    </button>
                  )}
                </div>

                {/* Project Context files count */}
                {attachedFiles.filter((f) => f.type === "project").length > 0 && (
                  <div style={{ fontSize: "0.65rem", color: "var(--primary)", marginTop: 6 }}>
                    {attachedFiles.filter((f) => f.type === "project").length} {isZh ? "\u9879\u76EE\u6587\u4EF6\u5728\u4E0A\u4E0B\u6587\u4E2D" : "project files in context"}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>




      {/* Center: Chat area */}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>{activeConv?.title || tk("chat.newConversation")}</span>
            {/* Model pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: "0.75rem" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: viewState.hasModel && viewState.configured ? (viewState.status === "healthy" ? "var(--green)" : "var(--amber)") : "var(--text-muted)" }}></span>
              <span style={{ fontWeight: 500, color: "var(--text)" }}>{viewState.hasModel ? viewState.providerLabel : (tk("chat.noConfiguredModel"))}</span>
              <span style={{ color: "var(--text-muted)" }}>/ {viewState.hasModel ? viewState.modelLabel : ""}</span>
            </div>
            {/* Switch Model button */}
            <button onClick={() => { setInstalledModels(getEnabledModels()); setShowModelPanel(true); }} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "4px 10px", color: "var(--primary)" }}>
              {tk("chat.switchModel")}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {activeConv && activeConv.messages.length > 0 && (
              <button onClick={handleClearConversation} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "4px 10px" }}>{tk("chat.clearConversation")}</button>
            )}
            <button onClick={() => setShowRightPanel(!showRightPanel)} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "4px 10px" }}>
              {showRightPanel ? tk("chat.hideInspector") : tk("chat.showInspector")}
            </button>
          </div>
        </div>
        {/* ModelPickerPanel modal */}
        {showModelPanel && (
          <ModelPickerPanel
            onClose={() => setShowModelPanel(false)}
            onSelect={(pid: string, mid: string) => { handleSetActiveModel(pid, mid); setShowModelPanel(false); }}
            selectedProvider={viewState.resolved?.providerId || ""}
            selectedModel={viewState.modelLabel}
            providerConfigs={providerConfigs}
          />
        )}

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

              <div style={{ padding: "12px 16px", borderRadius: "var(--radius-lg)", background: msg.role === "user" ? "var(--surface)" : "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "0.85rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{(msg as any).displayContent || msg.content}</div>

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

                  {String.fromCodePoint(0x1F4C4)} {f.name}

                  <button onClick={() => handleRemoveFile(f.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: 0, lineHeight: 1 }}>x</button>

                </span>

              ))}

            </div>

          )}



          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>

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

              📎 {tk("chat.attachFile")}

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

                {isRunning && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "auto" }}>&#9654;</span>}

              </div>

            )}

          </div>

          <div onClick={() => setCollapsedSections((prev) => { const next = new Set(prev); if (next.has("inspector")) next.delete("inspector"); else next.add("inspector"); return next; })}

            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>

            <h4 style={{ margin: 0, color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>{tk("chat.inspector")}</h4>

            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{collapsedSections.has("inspector") ? "▶" : "▼"}</span>

          </div>

          {!collapsedSections.has("inspector") && (

            <>
              <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>{tk("chat.activeModel")}</div>
                {hasConfigured ? (
                  <>
                    <div style={{ fontSize: "0.8rem", color: "var(--text)", fontWeight: 500 }}>{viewState.hasModel ? viewState.displayLabel : normalizeDisplayText(tk("chat.noConfiguredModel") || "Not configured")}</div>
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: viewState.hasModel && viewState.configured ? (viewState.status === "healthy" ? "var(--green)" : "var(--amber)") : "var(--text-muted)" }}></span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {viewState.hasModel && viewState.configured ? normalizeDisplayText(tk("common.configured")) : normalizeDisplayText(tk("common.notConfigured"))}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "0.8rem", color: "var(--text)", fontWeight: 500 }}>{normalizeDisplayText(tk("chat.noConfiguredModel"))}</div>
                    <div style={{ marginTop: 4, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {normalizeDisplayText(tk("status.notConfigured"))}
                    </div>
                    <button onClick={() => { window.dispatchEvent(new CustomEvent('tokenfence:navigate', { detail: { screen: 'models' } })) }} className="btn btn-ghost" style={{ marginTop: 6, fontSize: "0.7rem", padding: "3px 10px", color: "var(--primary)" }}>
                      {tk("chat.configureProvider")} &rarr;
                    </button>
                  </>
                )}
              </div>

              <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--surface-alt)" }}>

                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>{tk("chat.promptGuard")}</div>

                {lastGuardResult ? (

                  <div style={{ fontSize: "0.75rem", color: lastGuardResult.flagged ? "var(--amber)" : "var(--green)" }}>{lastGuardResult.flagged ? lastGuardResult.details : tk("chat.guardNoIssues")}</div>

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

                      <div style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>{f.type} · {(f.size / 1024).toFixed(1)} KB</div>

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

    </div>

  );

}