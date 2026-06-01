"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { analyzeIntent } from "@/lib/core/intent";
import { guardPrompt } from "@/lib/core/guard";
import type { GuardMode, GuardResult, PolicyId } from "@/lib/types";
import { ProviderPicker } from "./provider-picker";
import { Badge, Field, buttonClass, ghostButtonClass, inputClass } from "./ui";

type Lang = "en" | "zh";

type ChatResponse = {
  answer?: string;
  error?: string;
  intent?: {
    intent: string;
    confidence: number;
    language: string;
    needsRealtime: boolean;
    entities?: Record<string, string>;
  };
  skills?: Array<{
    name: string;
    status: string;
    title: string;
    content: string;
    source?: string;
  }>;
  guard?: GuardResult;
  usage?: { input?: number; output?: number; total?: number };
  durationMs?: number;
  archiveId?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: ChatResponse;
  createdAt?: string;
};

type Session = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  model?: string;
};

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string;
  preview?: string;
};

const STORAGE_KEY = "tokenfence.chat.sessions.v4";
const LEGACY_KEYS = ["tokenfence.chat.sessions.v3", "tokenfence.chat.sessions.v2"];

const copy = {
  en: {
    title: "Chat",
    subtitle: "A normal chat surface with a safety pass before every model call.",
    settings: "Settings",
    system: "System prompt",
    mode: "Guard mode",
    policy: "Policy profile",
    budget: "Token budget",
    safe: "redact + compress",
    redact: "redact only",
    compress: "compress only",
    policyStrict: "Strict privacy",
    policyBalanced: "Balanced",
    policyFast: "Fast",
    policyDeveloper: "Developer debug",
    finalPrompt: "Final prompt preview",
    route: "Routing",
    action: "Action",
    effectiveMode: "Effective mode",
    beforeSend: "Pre-flight check",
    placeholder: "Message TokenFence. Paste code, logs, notes, or drop files here...",
    send: "Send",
    sending: "Sending",
    attach: "Attach",
    clear: "Clear",
    clearAll: "Clear all",
    newChat: "New chat",
    exportChat: "Export",
    recent: "Chats",
    search: "Search chats",
    noChats: "No chats yet.",
    report: "Safety",
    detected: "Detected",
    noSecrets: "No obvious secrets found.",
    duration: "Duration",
    archive: "Archive",
    safePrompt: "Safe prompt",
    rawPrompt: "Raw prompt",
    droppedImage: "Image attached. Vision/OCR can be wired in later.",
    fileReadError: "Some files could not be read.",
    welcome: "New chat ready. Pick a model, then ask normally.",
    thinking: "TokenFence is checking the prompt and calling the model...",
    emptyStateTitle: "Start with a message or a file",
    emptyStateBody: "Drop a README, .env, log, screenshot, or notes. TokenFence will scan, redact, compress, call the selected model, and keep the run local.",
    quick1: "Review this for leaked secrets",
    quick2: "Compress this project context",
    quick3: "Turn this into an agent-ready prompt",
    attached: "attached",
    current: "current",
    delete: "Delete",
    copied: "Copied",
    runMeta: "Run meta",
    noRun: "No run yet. Send a message to see token changes, risk level, archive id, and any skills used.",
    intent: "Intent",
    skills: "Skills",
    localOnly: "Local chat history",
    noMatch: "No matching chats.",
    dropTitle: "Drop files here",
    dropBody: "Text-like files are folded into the prompt. Images are kept as local attachments."
  },
  zh: {
    title: "聊天",
    subtitle: "像普通聊天一样使用，只是在每次发送前加一层安全处理。",
    settings: "设置",
    system: "系统提示词",
    mode: "安全模式",
    policy: "策略模式",
    budget: "Token 预算",
    safe: "脱敏 + 压缩",
    redact: "只脱敏",
    compress: "只压缩",
    policyStrict: "严格隐私",
    policyBalanced: "平衡模式",
    policyFast: "快速模式",
    policyDeveloper: "开发调试",
    finalPrompt: "最终 Prompt 预览",
    route: "路由建议",
    action: "处理建议",
    effectiveMode: "实际模式",
    beforeSend: "发送前检查",
    placeholder: "直接提问。可以粘贴代码、日志、笔记，也可以拖入文件...",
    send: "发送",
    sending: "发送中",
    attach: "上传",
    clear: "清空",
    clearAll: "全部清空",
    newChat: "新聊天",
    exportChat: "导出",
    recent: "聊天记录",
    search: "搜索聊天",
    noChats: "还没有聊天。",
    report: "安全",
    detected: "检测结果",
    noSecrets: "没有发现明显敏感信息。",
    duration: "耗时",
    archive: "存档",
    safePrompt: "安全 Prompt",
    rawPrompt: "原始 Prompt",
    droppedImage: "图片已添加，后续可以继续接 OCR / 视觉模型。",
    fileReadError: "有些文件读取失败。",
    welcome: "新聊天已准备好。选择模型后就可以正常提问。",
    thinking: "TokenFence 正在检查 Prompt 并调用模型...",
    emptyStateTitle: "从一条消息或一个文件开始",
    emptyStateBody: "可以拖入 README、.env、日志、截图或笔记。TokenFence 会先扫描、脱敏、压缩，再调用模型并本地保存记录。",
    quick1: "检查这段内容有没有泄露风险",
    quick2: "压缩这段项目上下文",
    quick3: "整理成给 Coding Agent 的 Prompt",
    attached: "已上传",
    current: "当前",
    delete: "删除",
    copied: "已复制",
    runMeta: "运行信息",
    noRun: "还没有运行。发送一条消息后，这里会显示风险、token 变化、存档编号和使用的技能。",
    intent: "意图",
    skills: "技能",
    localOnly: "本地聊天记录",
    noMatch: "没有匹配的聊天。",
    dropTitle: "把文件拖到这里",
    dropBody: "文本类文件会合并进 Prompt，图片会作为本地附件保留。"
  }
};

export function ChatDesk({ readyKey = 0, lang = "en" }: { readyKey?: number; lang?: Lang }) {
  const t = copy[lang];
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [system, setSystem] = useState("You are practical, careful with privacy, and you preserve the user's original intent. Use collected tool context when it is available.");
  const [budget, setBudget] = useState(4000);
  const [mode, setMode] = useState<GuardMode>("safe");
  const [policy, setPolicy] = useState<PolicyId>("balanced");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lastRun, setLastRun] = useState<ChatResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => sessions.find((item) => item.id === currentId), [sessions, currentId]);
  const messages = current?.messages || [];
  const visibleMessages = messages.filter((message) => message.id !== "welcome");

  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) => [session.title, session.model, session.providerId].join(" ").toLowerCase().includes(needle));
  }, [sessions, query]);

  const attachmentText = useMemo(() => attachments.map((file) => {
    if (file.content) return `\n\n[Attached file: ${file.name}]\n${file.content}`;
    return `\n\n[Attached file: ${file.name}; type=${file.type || "unknown"}; size=${file.size} bytes]`;
  }).join(""), [attachments]);

  useEffect(() => {
    const stored = readSessions();
    if (stored.length) {
      setSessions(stored);
      setCurrentId(stored[0].id);
      return;
    }
    const first = makeSession(t.welcome, lang === "en" ? "New chat" : "新聊天");
    setSessions([first]);
    setCurrentId(first.id);
  }, []);

  useEffect(() => {
    if (sessions.length) writeSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function setCurrentMessages(next: Message[], patch: Partial<Session> = {}) {
    setSessions((items) => items.map((item) => {
      if (item.id !== currentId) return item;
      return {
        ...item,
        ...patch,
        messages: next,
        updatedAt: new Date().toISOString(),
        providerId,
        model
      };
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  }

  async function send() {
    const clean = input.trim();
    if ((!clean && !attachments.length) || busy || !currentId) return;

    const prompt = `${clean || "Please review the attached context."}${attachmentText}`;
    const userText = clean || attachments.map((file) => `[${file.name}]`).join("\n");
    const previewIntent = analyzeIntent(prompt);
    const previewGuard = guardPrompt(prompt, { budget, mode, policy, intent: previewIntent, providerId, model });
    setLastRun({ guard: previewGuard, intent: previewIntent, durationMs: 0 });
    const userMessage: Message = { id: id(), role: "user", content: userText, createdAt: new Date().toISOString() };
    const optimistic = [...messages, userMessage];
    const nextTitle = shouldRename(current?.title) ? titleFromPrompt(clean || attachments[0]?.name || "New chat") : current?.title;

    setCurrentMessages(optimistic, { title: nextTitle || titleFromPrompt(clean) });
    setInput("");
    setAttachments([]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId,
          model,
          prompt,
          system,
          budget,
          mode,
          policy,
          history: messages
            .filter((item) => item.id !== "welcome")
            .slice(-8)
            .map((item) => ({ role: item.role, content: item.content }))
        })
      });
      const json: ChatResponse = await res.json();
      const assistantMessage: Message = {
        id: id(),
        role: "assistant",
        content: json.error || json.answer || "No response returned.",
        meta: json,
        createdAt: new Date().toISOString()
      };
      setLastRun(json);
      setCurrentMessages([...optimistic, assistantMessage], { title: nextTitle || titleFromPrompt(clean) });
    } catch (error) {
      const err: ChatResponse = { error: error instanceof Error ? error.message : "Request failed." };
      setLastRun(err);
      setCurrentMessages([...optimistic, { id: id(), role: "assistant", content: err.error || "Request failed.", meta: err, createdAt: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const next: Attachment[] = [];

    for (const file of list) {
      try {
        if (isTextLike(file)) {
          const content = await file.text();
          next.push({ id: id(), name: file.name, type: file.type, size: file.size, content: content.slice(0, 50000) });
        } else if (file.type.startsWith("image/")) {
          next.push({ id: id(), name: file.name, type: file.type, size: file.size, preview: await readAsDataUrl(file) });
        } else {
          next.push({ id: id(), name: file.name, type: file.type, size: file.size });
        }
      } catch {
        console.warn(t.fileReadError);
      }
    }

    setAttachments((items) => [...items, ...next]);
  }

  function newChat() {
    const next = makeSession(t.welcome, lang === "en" ? "New chat" : "新聊天");
    setSessions((items) => [next, ...items]);
    setCurrentId(next.id);
    setInput("");
    setAttachments([]);
    setLastRun(null);
  }

  function clearCurrent() {
    if (!currentId) return;
    const emptyTitle = lang === "en" ? "New chat" : "新聊天";
    setSessions((items) => items.map((item) => item.id === currentId ? {
      ...item,
      title: emptyTitle,
      messages: makeSession(t.welcome, emptyTitle).messages,
      updatedAt: new Date().toISOString()
    } : item));
    setInput("");
    setAttachments([]);
    setLastRun(null);
  }

  function clearAll() {
    const next = makeSession(t.welcome, lang === "en" ? "New chat" : "新聊天");
    setSessions([next]);
    setCurrentId(next.id);
    setInput("");
    setAttachments([]);
    setLastRun(null);
  }

  function deleteSession(sessionId: string) {
    setSessions((items) => {
      const kept = items.filter((item) => item.id !== sessionId);
      if (kept.length) {
        if (sessionId === currentId) setCurrentId(kept[0].id);
        return kept;
      }
      const next = makeSession(t.welcome, lang === "en" ? "New chat" : "新聊天");
      setCurrentId(next.id);
      return [next];
    });
  }

  function exportCurrent() {
    if (!current) return;
    const md = [
      `# ${current.title}`,
      "",
      `Provider: ${providerId || current.providerId || "not selected"}`,
      `Model: ${model || current.model || "not selected"}`,
      `Updated: ${current.updatedAt}`,
      "",
      ...current.messages.filter((item) => item.id !== "welcome").map((item) => `## ${item.role}\n\n${item.content}`)
    ].join("\n");
    download(`${safeFileName(current.title)}.md`, md, "text/markdown");
  }

  async function copySafePrompt() {
    const text = lastRun?.guard?.finalPrompt || lastRun?.guard?.safePrompt;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      className="relative grid h-full min-h-0 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
      }}
    >
      {dragging ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-slate-400 bg-white/85 backdrop-blur">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-700 shadow-soft">
            <UploadCloud className="mx-auto mb-3" size={40} />
            <div className="text-lg font-semibold">{t.dropTitle}</div>
            <div className="mt-1 text-sm text-slate-500">{t.dropBody}</div>
          </div>
        </div>
      ) : null}

      <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-soft">
        <button className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-700" onClick={newChat}>
          <MessageSquarePlus size={16} /> {t.newChat}
        </button>

        <label className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 focus-within:border-slate-400 focus-within:bg-white">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>

        <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>{t.recent}</span>
          <span>{sessions.length}</span>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
          {filteredSessions.length ? filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => { setCurrentId(session.id); setLastRun(lastMeta(session)); }}
              className={`group w-full rounded-xl px-3 py-2 text-left text-sm transition ${session.id === currentId ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{session.title}</span>
                {session.id === currentId ? <span className="h-2 w-2 rounded-full bg-emerald-400" title={t.current} /> : null}
              </div>
              <div className={`mt-1 truncate text-xs ${session.id === currentId ? "text-slate-300" : "text-slate-400"}`}>{session.model || "model not set"}</div>
              <div className={`mt-1 text-[11px] ${session.id === currentId ? "text-slate-400" : "text-slate-400"}`}>{formatDate(session.updatedAt)}</div>
            </button>
          )) : <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{query ? t.noMatch : t.noChats}</div>}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={exportCurrent} disabled={!current}>
            <Download className="mr-1 inline" size={13} /> {t.exportChat}
          </button>
          <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => currentId && deleteSession(currentId)} title={t.delete}>
            <Trash2 size={13} />
          </button>
          <button className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50" onClick={clearAll}>
            {t.clearAll}
          </button>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="shrink-0 border-b border-slate-100 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-950">{current?.title || t.title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{t.subtitle}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className={ghostButtonClass} onClick={() => setShowSettings((value) => !value)} title={t.settings}>
                <span className="inline-flex items-center gap-2"><Settings2 size={16} /> <span className="hidden sm:inline">{t.settings}</span></span>
              </button>
              <button className={ghostButtonClass} onClick={clearCurrent} title={t.clear}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <ProviderPicker readyKey={readyKey} value={providerId} model={model} compact onChange={(next) => {
              setProviderId(next.providerId);
              setModel(next.model);
            }} />
          </div>

          {showSettings ? (
            <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <Field label={t.system}>
                <input className={inputClass} value={system} onChange={(event) => setSystem(event.target.value)} />
              </Field>
              <Field label={t.policy}>
                <select className={inputClass} value={policy} onChange={(event) => setPolicy(event.target.value as PolicyId)}>
                  <option value="strict">{t.policyStrict}</option>
                  <option value="balanced">{t.policyBalanced}</option>
                  <option value="fast">{t.policyFast}</option>
                  <option value="developer">{t.policyDeveloper}</option>
                </select>
              </Field>
              <Field label={t.mode}>
                <select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value as GuardMode)}>
                  <option value="safe">{t.safe}</option>
                  <option value="redact-only">{t.redact}</option>
                  <option value="compress-only">{t.compress}</option>
                </select>
              </Field>
              <Field label={t.budget}>
                <input className={inputClass} type="number" min={512} value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-5 scrollbar-thin">
          {!visibleMessages.length ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white"><ShieldCheck size={22} /></div>
              <h3 className="text-lg font-semibold text-slate-950">{t.emptyStateTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t.emptyStateBody}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {[t.quick1, t.quick2, t.quick3].map((item) => (
                  <button key={item} onClick={() => setInput(item)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">{item}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {visibleMessages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <article className={`max-w-[86%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-60">{message.role === "user" ? "You" : "TokenFence"}</div>
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    {message.meta?.guard ? <MiniReport result={message.meta} /> : null}
                  </article>
                </div>
              ))}
              {busy ? (
                <div className="flex justify-start">
                  <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">{t.thinking}</div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white p-3">
          {attachments.length ? (
            <div className="mb-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1 scrollbar-thin">
              {attachments.map((file) => (
                <div key={file.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {file.preview ? <img src={file.preview} alt="" className="h-8 w-8 rounded-lg object-cover" /> : file.type.startsWith("image/") ? <ImageIcon size={14} /> : <FileText size={14} />}
                  <span className="max-w-[220px] truncate">{file.name}</span>
                  <Badge tone="blue">{t.attached}</Badge>
                  <button onClick={() => setAttachments((items) => items.filter((item) => item.id !== file.id))} className="text-slate-400 hover:text-slate-800"><X size={14} /></button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-slate-400">
            <textarea
              className="max-h-32 min-h-[56px] w-full resize-none rounded-xl px-3 py-2 text-sm outline-none"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t.placeholder}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send();
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => event.target.files && addFiles(event.target.files)} />
                <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip size={16} /> {t.attach}
                </button>
                {lastRun?.guard ? <Badge tone={toneForRisk(lastRun.guard.riskAfter.label)}>risk {lastRun.guard.riskBefore.label} → {lastRun.guard.riskAfter.label}</Badge> : null}
                {lastRun?.guard ? <Badge tone="blue">{lastRun.guard.tokensBefore} → {lastRun.guard.tokensAfter}</Badge> : null}
              </div>
              <button className={buttonClass} disabled={busy || !providerId || (!input.trim() && !attachments.length)} onClick={send}>
                <span className="inline-flex items-center gap-2">{busy ? t.sending : t.send}<Send size={16} /></span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft xl:flex">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{t.report}</h2>
              <p className="mt-1 text-xs text-slate-500">{t.runMeta}</p>
            </div>
            <ShieldCheck size={18} className="text-slate-400" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
          {!lastRun ? <p className="rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-500">{t.noRun}</p> : null}
          {lastRun?.error ? <p className="whitespace-pre-wrap rounded-2xl bg-red-50 p-3 text-sm text-red-700">{lastRun.error}</p> : null}
          {lastRun?.guard ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge tone={toneForRisk(lastRun.guard.riskAfter.label)}>Risk {lastRun.guard.riskBefore.label} → {lastRun.guard.riskAfter.label}</Badge>
                <Badge tone="blue">{lastRun.guard.tokensBefore} → {lastRun.guard.tokensAfter}</Badge>
                <Badge tone="green">saved {lastRun.guard.savedPercent}%</Badge>
                <Badge tone="amber">{lastRun.guard.policy}</Badge>
                <Badge tone="blue">{t.effectiveMode}: {lastRun.guard.effectiveMode}</Badge>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 font-medium text-slate-800">{t.action}</div>
                <div className="text-sm font-semibold text-slate-900">{lastRun.guard.action.label}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{lastRun.guard.action.reason}</p>
                {lastRun.guard.action.requiresConfirmation ? <Badge tone="amber">review recommended</Badge> : null}
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 font-medium text-slate-800">{t.route}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone={lastRun.guard.routing.localPreferred ? "amber" : "blue"}>{lastRun.guard.routing.label}</Badge>
                  {lastRun.guard.routing.providerId ? <Badge>{lastRun.guard.routing.providerId}</Badge> : null}
                  {lastRun.guard.routing.model ? <Badge>{lastRun.guard.routing.model}</Badge> : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{lastRun.guard.routing.reason}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 font-medium text-slate-800">{t.intent}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone="blue">{lastRun.intent?.intent || lastRun.guard.intent?.intent || "chat"}</Badge>
                  {(lastRun.intent?.needsRealtime || lastRun.guard.intent?.needsRealtime) ? <Badge tone="amber">realtime</Badge> : null}
                  {(lastRun.intent?.entities?.location || lastRun.guard.intent?.entities?.location) ? <Badge tone="green">{lastRun.intent?.entities?.location || lastRun.guard.intent?.entities?.location}</Badge> : null}
                </div>
              </div>
              {(lastRun.skills?.length || lastRun.guard.skills?.length) ? (
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="mb-2 font-medium text-slate-800">{t.skills}</div>
                  <div className="space-y-2 text-xs text-slate-600">
                    {(lastRun.skills || lastRun.guard.skills || []).map((skill, index) => (
                      <div key={index} className="rounded-xl border border-slate-200 bg-white p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{skill.title}</span>
                          <Badge tone={skill.status === "ok" ? "green" : skill.status === "error" ? "red" : "amber"}>{skill.status}</Badge>
                        </div>
                        {skill.source ? <div className="mt-1 text-slate-400">{skill.source}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-2 font-medium text-slate-800">{t.detected}</div>
                {lastRun.guard.detections.length ? (
                  <ul className="space-y-1 text-slate-600">
                    {lastRun.guard.detections.slice(0, 10).map((item, index) => <li key={index}>- {item.label} <span className="text-slate-400">({item.severity})</span></li>)}
                  </ul>
                ) : <span className="text-slate-500">{t.noSecrets}</span>}
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">
                <div>{t.duration}: {lastRun.durationMs}ms</div>
                <div>{t.archive}: {lastRun.archiveId || "not saved"}</div>
                {lastRun.usage ? <div>Usage: in {lastRun.usage.input || "?"} · out {lastRun.usage.output || "?"}</div> : null}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{t.finalPrompt}</h3>
                  <button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50" onClick={copySafePrompt}>
                    <Copy size={12} /> {copied ? t.copied : "Copy"}
                  </button>
                </div>
                <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-3 text-xs leading-5 text-slate-100 scrollbar-thin">{lastRun.guard.finalPrompt || lastRun.guard.safePrompt}</pre>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function MiniReport({ result }: { result: ChatResponse }) {
  if (!result.guard) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/30 pt-3">
      <Badge tone={toneForRisk(result.guard.riskAfter.label)}>risk {result.guard.riskAfter.label}</Badge>
      <Badge tone="blue">{result.guard.effectiveMode}</Badge>
      <Badge tone="blue">{result.guard.tokensAfter} tokens</Badge>
      <Badge tone="green">saved {result.guard.savedPercent}%</Badge>
      {(result.skills?.length || result.guard.skills?.length) ? <Badge tone="amber">skill {(result.skills || result.guard.skills || [])[0]?.name}</Badge> : null}
    </div>
  );
}

function toneForRisk(label: string) {
  if (label === "critical" || label === "high") return "red" as const;
  if (label === "medium") return "amber" as const;
  return "green" as const;
}

function makeSession(welcome: string, title = "New chat"): Session {
  const now = new Date().toISOString();
  return {
    id: id(),
    title,
    messages: [{ id: "welcome", role: "assistant", content: welcome, createdAt: now }],
    createdAt: now,
    updatedAt: now
  };
}

function readSessions(): Session[] {
  if (typeof window === "undefined") return [];
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function writeSessions(sessions: Session[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 60)));
}

function lastMeta(session: Session) {
  const message = [...session.messages].reverse().find((item) => item.meta);
  return message?.meta || null;
}

function id() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
}

function shouldRename(title?: string) {
  return !title || title === "New chat" || title === "新聊天";
}

function titleFromPrompt(prompt: string) {
  const firstLine = prompt.split("\n").map((line) => line.trim()).find(Boolean) || "New chat";
  return firstLine.length > 38 ? `${firstLine.slice(0, 38)}...` : firstLine;
}

function safeFileName(name: string) {
  return name.replace(/[^a-z0-9\-_一-龥]+/gi, "-").replace(/^-+|-+$/g, "") || "chat";
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isTextLike(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("text/") || /\.(md|txt|json|csv|log|env|yml|yaml|xml|html|css|js|jsx|ts|tsx|py|java|go|rs|php|rb|sql|sh|ps1)$/i.test(name);
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}
