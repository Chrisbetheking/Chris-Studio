"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Bot, Boxes, FileSearch, FolderClock, KeyRound, Languages, ShieldCheck, SplitSquareHorizontal } from "lucide-react";
import { Badge } from "./ui";
import { ProviderSettings } from "./provider-settings";
import { ChatDesk } from "./chat-desk";
import { GuardDesk } from "./guard-desk";
import { CompareDesk } from "./compare-desk";
import { ArchiveView } from "./archive-view";
import { ContextPackView } from "./context-pack-view";
import { DocumentPipelineDesk } from "./document-pipeline-desk";

type Tab = "chat" | "providers" | "guard" | "compare" | "documents" | "archive" | "context";
type Lang = "en" | "zh";

function makeTabs(lang: Lang): Array<{ id: Tab; label: string; icon: React.ReactNode }> {
  return [
    { id: "chat", label: lang === "en" ? "Chat" : "聊天", icon: <Bot size={17} /> },
    { id: "providers", label: lang === "en" ? "Providers" : "模型", icon: <KeyRound size={17} /> },
    { id: "guard", label: "Guard", icon: <ShieldCheck size={17} /> },
    { id: "compare", label: lang === "en" ? "Matrix" : "矩阵", icon: <SplitSquareHorizontal size={17} /> },
    { id: "documents", label: lang === "en" ? "Docs" : "文档", icon: <FileSearch size={17} /> },
    { id: "archive", label: lang === "en" ? "Archive" : "存档", icon: <FolderClock size={17} /> },
    { id: "context", label: lang === "en" ? "Agent Pack" : "Agent 包", icon: <Boxes size={17} /> }
  ];
}

export function Studio() {
  const [tab, setTab] = useState<Tab>("chat");
  const [providersReady, setProvidersReady] = useState(0);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    document.title = "TokenFence Studio";
    const stored = localStorage.getItem("tokenfence.lang");
    if (stored === "en" || stored === "zh") setLang(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem("tokenfence.lang", lang);
  }, [lang]);

  const tabs = useMemo(() => makeTabs(lang), [lang]);

  const body = useMemo(() => {
    if (tab === "providers") return <ProviderSettings onSaved={() => setProvidersReady((n) => n + 1)} />;
    if (tab === "guard") return <GuardDesk />;
    if (tab === "compare") return <CompareDesk readyKey={providersReady} />;
    if (tab === "documents") return <DocumentPipelineDesk />;
    if (tab === "archive") return <ArchiveView />;
    if (tab === "context") return <ContextPackView />;
    return <ChatDesk readyKey={providersReady} lang={lang} />;
  }, [tab, providersReady, lang]);

  return (
    <main className="h-screen overflow-hidden bg-[#f6f7fb] p-4 md:p-5">
      <div className="mx-auto flex h-full max-w-[1720px] flex-col gap-4">
        <header className="relative flex shrink-0 flex-col justify-between gap-3 overflow-hidden rounded-3xl border border-slate-200 bg-white/85 px-4 py-3 shadow-soft backdrop-blur md:flex-row md:items-center">
          <div className="pointer-events-none absolute right-36 top-1/2 hidden -translate-y-1/2 select-none text-5xl font-black tracking-tight text-slate-900/[0.035] 2xl:block">ChrisWang</div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-950 px-2.5 text-xs font-semibold text-white shadow-sm">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px] text-slate-950">CW</span>
                ChrisWang Lab
              </span>
              <Badge tone="blue">local-first</Badge>
              <Badge>BYO API key</Badge>
              <Badge tone="green">multi-provider</Badge>
            </div>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">TokenFence Studio</h1>
              <p className="max-w-4xl text-sm leading-6 text-slate-600">
                {lang === "en" ? "A local AI workspace for prompt safety, document intelligence, Model Matrix, archives, and agent context packs." : "一个本地优先的 AI 工作台，支持 Prompt 安全、文档智能处理、Model Matrix、本地存档和 Agent 上下文包。"}
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-3 text-sm text-slate-600">
            <span className="hidden lg:inline">{lang === "en" ? "Keys and archives stay in" : "Key 和存档保存在本机"} <code className="rounded bg-slate-100 px-1 py-0.5">.tokenfence</code></span>
            <button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50" onClick={() => setLang(lang === "en" ? "zh" : "en")}>
              <Languages size={14} /> {lang === "en" ? "中文" : "English"}
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
          <nav className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-2 shrink-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <div className="font-medium text-slate-700">ChrisWang</div>
              <div>{lang === "en" ? "local AI workspace" : "本地 AI 工作台"}</div>
            </div>
          </nav>
          <div className="min-h-0 overflow-hidden">{body}</div>
        </div>
      </div>
    </main>
  );
}
