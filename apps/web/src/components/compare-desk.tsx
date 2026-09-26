"use client";

import { useMemo, useState } from "react";
import { FileText, GitCompareArrows, Plus, Trash2 } from "lucide-react";
import { ProviderPicker } from "./provider-picker";
import { Badge, Field, Panel, buttonClass, ghostButtonClass, inputClass } from "./ui";

type Target = { id: string; providerId: string; model: string };
type MatrixFile = {
  id: string;
  path: string;
  content: string;
  providerId: string;
  model: string;
  privacy: "auto" | "public" | "private" | "secret";
};

type CompareResult = {
  scope: "prompt" | "file";
  providerId: string;
  model?: string;
  ok: boolean;
  text?: string;
  error?: string;
  durationMs: number;
  usage?: { input?: number; output?: number; total?: number };
  riskBefore?: { label: string; score: number };
  riskAfter?: { label: string; score: number };
  intent?: string;
  effectiveMode?: string;
  finalPrompt?: string;
  filePath?: string;
  fileType?: string;
  privacy?: string;
  routingReason?: string;
};

const defaultPrompt = "Review this project/file and give me practical suggestions. Focus on safety, model routing, and implementation quality.";

function emptyTarget(): Target {
  return { id: crypto.randomUUID(), providerId: "", model: "" };
}

function emptyFile(): MatrixFile {
  return {
    id: crypto.randomUUID(),
    path: "src/example.ts",
    content: "",
    providerId: "",
    model: "",
    privacy: "auto"
  };
}

export function CompareDesk({ readyKey = 0 }: { readyKey?: number }) {
  const [targets, setTargets] = useState<Target[]>([emptyTarget(), emptyTarget()]);
  const [files, setFiles] = useState<MatrixFile[]>([emptyFile()]);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [policy, setPolicy] = useState<"strict" | "balanced" | "fast" | "developer">("balanced");
  const [results, setResults] = useState<CompareResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const runnableTargets = useMemo(() => targets.filter((item) => item.providerId), [targets]);
  const runnableFiles = useMemo(() => files.filter((item) => item.content.trim()), [files]);
  const hasRunnableWork = prompt.trim() && (runnableTargets.length > 0 || runnableFiles.length > 0);

  function updateTarget(id: string, next: Partial<Target>) {
    setTargets((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function removeTarget(id: string) {
    setTargets((items) => items.length <= 1 ? items : items.filter((item) => item.id !== id));
  }

  function updateFile(id: string, next: Partial<MatrixFile>) {
    setFiles((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function removeFile(id: string) {
    setFiles((items) => items.length <= 1 ? items : items.filter((item) => item.id !== id));
  }

  async function runMatrix() {
    setBusy(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          policy,
          mode: "safe",
          targets: runnableTargets,
          files: runnableFiles,
          maxTokens: 1200
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Model Matrix run failed");
      setResults(json.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Model Matrix run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 scrollbar-thin xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <Panel
          title="Model Matrix"
          right={<Badge tone="blue">multi-model + file routing</Badge>}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-950">
              Run one prompt across multiple models, or assign different files to different models. TokenFence still runs the pre-flight safety layer before every model request.
            </div>

            <Field label="Task / shared prompt" hint="This task is used for both model comparison and file-level processing.">
              <textarea className={`${inputClass} min-h-[135px]`} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </Field>

            <Field label="Policy profile">
              <select className={inputClass} value={policy} onChange={(event) => setPolicy(event.target.value as typeof policy)}>
                <option value="strict">Strict privacy</option>
                <option value="balanced">Balanced</option>
                <option value="fast">Fast</option>
                <option value="developer">Developer</option>
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Prompt targets" right={<Badge>{runnableTargets.length} selected</Badge>}>
          <div className="space-y-3">
            {targets.map((target, index) => (
              <div className="rounded-2xl border border-slate-200 p-3" key={target.id}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                  <span>Target {index + 1}</span>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => removeTarget(target.id)} title="Remove target">
                    <Trash2 size={15} />
                  </button>
                </div>
                <ProviderPicker readyKey={readyKey} value={target.providerId} model={target.model} onChange={(next) => updateTarget(target.id, next)} compact />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className={ghostButtonClass} onClick={() => setTargets((items) => [...items, emptyTarget()])}>
              <span className="inline-flex items-center gap-1"><Plus size={15} /> Add model</span>
            </button>
          </div>
        </Panel>

        <Panel title="File-level routing" right={<Badge tone="green">{runnableFiles.length} files</Badge>}>
          <div className="space-y-3">
            {files.map((file, index) => (
              <div className="rounded-2xl border border-slate-200 p-3" key={file.id}>
                <div className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                  <span className="inline-flex items-center gap-2"><FileText size={15} /> File {index + 1}</span>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => removeFile(file.id)} title="Remove file">
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
                  <Field label="Path">
                    <input className={inputClass} value={file.path} onChange={(event) => updateFile(file.id, { path: event.target.value })} placeholder="src/app/page.tsx" />
                  </Field>
                  <Field label="Privacy">
                    <select className={inputClass} value={file.privacy} onChange={(event) => updateFile(file.id, { privacy: event.target.value as MatrixFile["privacy"] })}>
                      <option value="auto">Auto</option>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                      <option value="secret">Secret / local only</option>
                    </select>
                  </Field>
                </div>

                <div className="mt-3">
                  <ProviderPicker readyKey={readyKey} value={file.providerId} model={file.model} onChange={(next) => updateFile(file.id, next)} compact />
                </div>

                <Field label="Content" hint="Paste one file here. For real file upload, this panel can later be connected to your file parser.">
                  <textarea className={`${inputClass} mt-3 min-h-[120px] font-mono text-xs`} value={file.content} onChange={(event) => updateFile(file.id, { content: event.target.value })} placeholder="Paste file content here..." />
                </Field>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className={ghostButtonClass} onClick={() => setFiles((items) => [...items, emptyFile()])}>
              <span className="inline-flex items-center gap-1"><Plus size={15} /> Add file</span>
            </button>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-3">
          <button className={buttonClass} disabled={busy || !hasRunnableWork} onClick={runMatrix}>
            <span className="inline-flex items-center gap-2"><GitCompareArrows size={16} /> {busy ? "Running Model Matrix..." : "Run Model Matrix"}</span>
          </button>
          <button className={ghostButtonClass} onClick={() => { setResults([]); setError(""); }}>Clear results</button>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      </div>

      <div className="space-y-5">
        <Panel title="Matrix results" right={<Badge>{results.length || "no"} runs</Badge>}>
          {!results.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Run several models or file routes to compare quality, latency, token usage, risk level, and routing decisions.
            </div>
          ) : (
            <div className="grid gap-4">
              {results.map((item, index) => (
                <div className="rounded-2xl border border-slate-200 bg-white p-4" key={index}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.scope === "file" ? "green" : "blue"}>{item.scope}</Badge>
                        <h3 className="truncate text-sm font-semibold text-slate-900">{item.providerId} / {item.model || "default"}</h3>
                      </div>
                      {item.filePath ? <div className="mt-1 text-xs text-slate-500">{item.filePath} · {item.fileType} · {item.privacy}</div> : null}
                    </div>
                    <Badge tone={item.ok ? "green" : "red"}>{item.ok ? `${item.durationMs}ms` : "failed"}</Badge>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge tone="blue">intent {item.intent || "?"}</Badge>
                    <Badge tone={riskTone(item.riskBefore?.label)}>risk {item.riskBefore?.label || "?"}</Badge>
                    <Badge>mode {item.effectiveMode || "?"}</Badge>
                    <Badge>in {item.usage?.input || "?"}</Badge>
                    <Badge>out {item.usage?.output || "?"}</Badge>
                  </div>

                  {item.routingReason ? (
                    <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      <strong className="text-slate-800">Routing:</strong> {item.routingReason}
                    </div>
                  ) : null}

                  <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-50 scrollbar-thin">{item.ok ? item.text : item.error}</pre>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function riskTone(label?: string): "slate" | "green" | "amber" | "red" | "blue" {
  if (label === "low") return "green";
  if (label === "medium") return "amber";
  if (label === "high" || label === "critical") return "red";
  return "slate";
}
