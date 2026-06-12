"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive, Bot, Boxes, ChevronLeft, ChevronRight, FileSearch, FolderClock,
  KeyRound, Languages, Moon, ShieldCheck, SplitSquareHorizontal, Sun, Zap
} from "lucide-react";
import { Badge, Chip, StatusDot, VersionChip } from "./ui";
import { ProviderSettings } from "./provider-settings";
import { ChatDesk } from "./chat-desk";
import { GuardDesk } from "./guard-desk";
import { CompareDesk } from "./compare-desk";
import { ArchiveView } from "./archive-view";
import { ContextPackView } from "./context-pack-view";
import { AgentLab } from "./agent-lab";
import { PluginStore } from "./plugin-store";
import { OutputGen } from "./output-gen";
import { ComputerUseDesk } from "./computer-use-desk";
import { RoutingDesk } from "./routing-desk";
import { DocumentPipelineDesk } from "./document-pipeline-desk";

type Tab = "chat" | "providers" | "guard" | "compare" | "documents" | "archive" | "context" | "agent" | "plugins" | "output" | "computer-use" | "routing";
type Lang = "en" | "zh";

const version = "v0.5.0-dev";
const safetyMode = "on";

const navItems: Array<{ id: Tab; labelEn: string; labelZh: string; icon: React.ReactNode }> = [
  { id: "chat", labelEn: "Workspace", labelZh: "工作区", icon: <Bot size={18} /> },
  { id: "guard", labelEn: "Guard", labelZh: "安全", icon: <ShieldCheck size={18} /> },
  { id: "documents", labelEn: "Documents", labelZh: "文档", icon: <FileSearch size={18} /> },
  { id: "compare", labelEn: "Matrix", labelZh: "矩阵", icon: <SplitSquareHorizontal size={18} /> },
  { id: "providers", labelEn: "Providers", labelZh: "模型", icon: <KeyRound size={18} /> },
  { id: "archive", labelEn: "Archive", labelZh: "存档", icon: <FolderClock size={18} /> },
  { id: "context", labelEn: "Agent Pack", labelZh: "Agent 包", icon: <Boxes size={18} /> },
];

export function Studio() {
  const [tab, setTab] = useState<Tab>("chat");
  const [providersReady, setProvidersReady] = useState(0);
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Load and save preferences
  useEffect(() => {
    document.title = "TokenFence Studio";
    const storedLang = localStorage.getItem("tokenfence.lang");
    if (storedLang === "en" || storedLang === "zh") setLang(storedLang);
    const storedTheme = localStorage.getItem("tokenfence.theme");
    const isDark = storedTheme === "dark" || (!storedTheme && window.matchMedia("(prefers-color-scheme:dark)").matches);
    setDark(isDark);
  }, []);

  useEffect(() => { localStorage.setItem("tokenfence.lang", lang); }, [lang]);

  useEffect(() => {
    localStorage.setItem("tokenfence.theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Content body
  const body = useMemo(() => {
    if (tab === "providers") return <ProviderSettings onSaved={() => setProvidersReady((n) => n + 1)} />;
    if (tab === "guard") return <GuardDesk />;
    if (tab === "compare") return <CompareDesk readyKey={providersReady} />;
    if (tab === "documents") return <DocumentPipelineDesk />;
    if (tab === "archive") return <ArchiveView />;
    if (tab === "agent") return <AgentLab />;
    if (tab === "plugins") return <PluginStore />;
    if (tab === "output") return <OutputGen />;
    if (tab === "computer-use") return <ComputerUseDesk />;
    if (tab === "routing") return <RoutingDesk />;
    if (tab === "context") return <ContextPackView />;
    return <ChatDesk readyKey={providersReady} lang={lang} />;
  }, [tab, providersReady, lang]);

  const currentNav = navItems.find((n) => n.id === tab);
  const titleLabel = currentNav ? (lang === "en" ? currentNav.labelEn : currentNav.labelZh) : "";

  return (
    <main className="h-screen overflow-hidden bg-studio-50 dark:bg-slate-950 transition-colors duration-200">
      <div className="flex h-full flex-col">
        {/* ── Top bar ── */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-5 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold">TF</span>
              <span className="hidden sm:inline text-sm font-semibold text-slate-900 dark:text-slate-100">TokenFence</span>
            </span>
            <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500">/</span>
            <span className="hidden md:inline text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{titleLabel}</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Safety mode */}
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1">
              <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Guard Active</span>
            </div>

            {/* Model selector placeholder */}
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1">
              <Zap size={14} className="text-amber-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Local-first</span>
            </div>

            {/* Version */}
            <VersionChip version={version} />

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(!dark)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "zh" : "en")}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <Languages size={14} className="inline mr-1" />
              {lang === "en" ? "中文" : "English"}
            </button>

            {/* Inspector toggle */}
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={`rounded-lg p-1.5 transition ${inspectorOpen ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              title="Toggle inspector"
            >
              <ChevronRight size={17} className={`transition-transform ${inspectorOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </header>

        {/* ── Body: sidebar | main | inspector ── */}
        <div className="flex min-h-0 flex-1">
          {/* Left Sidebar */}
          <nav
            className={`shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur p-3 transition-all duration-200 overflow-hidden ${sidebarOpen ? "w-[200px]" : "w-[56px]"}`}
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                    tab === item.id
                      ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                  title={lang === "en" ? item.labelEn : item.labelZh}
                >
                  {item.icon}
                  {sidebarOpen && <span className="truncate">{lang === "en" ? item.labelEn : item.labelZh}</span>}
                </button>
              ))}
            </div>

            {sidebarOpen && (
              <div className="mt-3 shrink-0 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">ChrisWang Lab</div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">local AI workstation</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <StatusDot active />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{lang === "en" ? "All local" : "全部本地"}</span>
                </div>
              </div>
            )}
          </nav>

          {/* Main content */}
          <div className="min-w-0 flex-1 overflow-hidden animate-fade-in">
            {body}
          </div>

          {/* Right Inspector */}
          {inspectorOpen && (
            <aside className="hidden xl:flex shrink-0 w-[280px] flex-col border-l border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur p-4 gap-4 overflow-y-auto scrollbar-thin">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  {lang === "en" ? "Safety Status" : "安全状态"}
                </h3>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusDot active />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {lang === "en" ? "Prompt Guard Active" : "Prompt 安全防护已启用"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {lang === "en"
                      ? "All prompts are scanned, redacted, and routed through safe providers. Detections logged locally."
                      : "所有 Prompt 经过扫描、脱敏并通过安全提供商路由。检测记录保存在本地。"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  {lang === "en" ? "Runtime" : "运行环境"}
                </h3>
                <div className="space-y-2">
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{lang === "en" ? "Mode" : "模式"}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Chip tone="green">{lang === "en" ? "Local-first" : "本地优先"}</Chip>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{lang === "en" ? "Storage" : "存储路径"}</div>
                    <div className="text-xs font-mono text-slate-700 dark:text-slate-300 mt-1 truncate">.tokenfence/</div>
                  </div>
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{lang === "en" ? "Providers" : "提供商"}</div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                      {lang === "en" ? "Multi-provider with fallback" : "多提供商，支持故障切换"}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  {lang === "en" ? "Release" : "发布版本"}
                </h3>
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{lang === "en" ? "Version" : "版本"}</span>
                    <VersionChip version={version} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{lang === "en" ? "Android APK" : "Android APK"}</span>
                    <Chip tone="green">{lang === "en" ? "Available" : "可用"}</Chip>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center leading-relaxed">
                  TokenFence Studio — {lang === "en" ? "Local-first AI safety workstation" : "本地优先 AI 安全工作台"}<br />
                  {lang === "en" ? "Keys never leave your machine" : "密钥永不离开你的设备"}
                </p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
