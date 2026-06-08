"use client";

import { useMemo, useState } from "react";
import { ClipboardCopy, FileText, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Badge, Field, Panel, buttonClass, ghostButtonClass, inputClass } from "./ui";

type DraftFile = {
  id: string;
  path: string;
  content: string;
};

type PipelineResult = {
  createdAt: string;
  beforeCleaning: string;
  afterCleaning: string;
  markdown: string;
  chunksJson: string;
  summary: {
    fileCount: number;
    chunkCount: number;
    highRiskFiles: number;
    totalOriginalTokens: number;
    totalCleanedTokens: number;
    savedPercent: number;
  };
  files: Array<{
    fileName: string;
    fileKind: string;
    originalTokens: number;
    cleanedTokens: number;
    removedApproxPercent: number;
    risk: { label: string; score: number };
    chunks: unknown[];
    suggestedRoute: { providerId: string; model: string; reason: string; localPreferred: boolean };
    warnings: string[];
  }>;
};

const starterFiles: DraftFile[] = [
  {
    id: "sample-notes",
    path: "docs/INTERVIEW_NOTES.md",
    content: `# Interview Notes\n\nClient: Acme Pay CN\nContact: chris@example.com / 13900001111\nInternal DB: postgres://root:secret@localhost:5432/tokenfence\n\nPage 1 of 3\nTokenFence should not just upload files. It should parse documents, clean repeated headers, scan sensitive values, create RAG-ready chunks, and route each file to a suitable model.\n\nPage 2 of 3\nDocument Intelligence Pipeline should support PDF, DOCX, image OCR, logs, Markdown, and code files. Secret files should prefer local models.\n\nPage 3 of 3\nThe output should include clean Markdown, chunks.json, risk metadata, and suggested model routing.`
  }
];

export function DocumentPipelineDesk() {
  const [drafts, setDrafts] = useState<DraftFile[]>(starterFiles);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [view, setView] = useState<"markdown" | "chunks" | "before" | "after">("markdown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enableOcr, setEnableOcr] = useState(true);
  const [ocrLanguage, setOcrLanguage] = useState("eng");

  const runnableDrafts = useMemo(() => drafts.filter((file) => file.content.trim()), [drafts]);
  const canRun = uploadedFiles.length > 0 || runnableDrafts.length > 0;

  function updateDraft(id: string, next: Partial<DraftFile>) {
    setDrafts((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function removeDraft(id: string) {
    setDrafts((items) => items.length <= 1 ? items : items.filter((item) => item.id !== id));
  }

  function addDraft() {
    setDrafts((items) => [...items, { id: crypto.randomUUID(), path: "notes.txt", content: "" }]);
  }

  async function runPipeline() {
    setBusy(true);
    setError("");
    setResult(null);

    try {
      let res: Response;
      if (uploadedFiles.length) {
        const form = new FormData();
        for (const file of uploadedFiles) form.append("files", file);
        form.append("enableOcr", String(enableOcr));
        form.append("ocrLanguage", ocrLanguage);
        form.append("documents", JSON.stringify(runnableDrafts.map(({ path, content }) => ({ path, content }))));
        res = await fetch("/api/documents", { method: "POST", body: form });
      } else {
        res = await fetch("/api/documents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: runnableDrafts.map(({ path, content }) => ({ path, content })) })
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Document pipeline failed");
      setResult(json);
      setView("markdown");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document pipeline failed");
    } finally {
      setBusy(false);
    }
  }

  const output = result ? getOutput(result, view) : "Run the pipeline to generate clean Markdown and chunks.json.";

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 scrollbar-thin xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="space-y-5">
        <Panel title="Document Intelligence Pipeline" right={<Badge tone="blue">parse · clean · scan · chunk · route</Badge>}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-sm leading-6 text-blue-950">
              Upload files or paste document text. TokenFence now extracts text from PDF and DOCX files, runs local OCR for image uploads, cleans noisy content, scans risk, creates RAG-ready chunks, and suggests a model route before anything is sent to an LLM.
            </div>

            <Field label="Upload files" hint="PDF and DOCX are parsed on the server. Image files use built-in local OCR through Tesseract.js. Scanned PDF page OCR is still marked separately because it needs PDF-to-image rendering.">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 hover:bg-white">
                <UploadCloud className="mb-2 text-slate-400" size={28} />
                <span className="font-medium text-slate-700">Choose PDF, DOCX, image, log, markdown, or code files</span>
                <span className="mt-1 text-xs">The parser runs through the local Next.js API route. Uploaded files are parsed before they are sent to any LLM.</span>
                <input className="hidden" type="file" multiple onChange={(event) => setUploadedFiles(Array.from(event.target.files || []))} />
              </label>
            </Field>


            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="OCR language" hint="Use eng for English. Use chi_sim+eng after the language data is available locally or downloadable by Tesseract.js.">
                <input className={inputClass} value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value)} placeholder="eng" />
              </Field>
              <Field label="Image OCR">
                <button
                  className={enableOcr ? buttonClass : ghostButtonClass}
                  onClick={() => setEnableOcr((value) => !value)}
                  type="button"
                >
                  {enableOcr ? "OCR enabled" : "OCR disabled"}
                </button>
              </Field>
            </div>

            {uploadedFiles.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                <div className="mb-2 font-medium text-slate-700">Selected files</div>
                <div className="space-y-1 text-xs text-slate-500">
                  {uploadedFiles.map((file) => <div key={`${file.name}-${file.size}`}>{file.name} · {Math.round(file.size / 1024)} KB</div>)}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Manual documents" right={<Badge tone="green">{runnableDrafts.length} ready</Badge>}>
          <div className="space-y-3">
            {drafts.map((file, index) => (
              <div className="rounded-2xl border border-slate-200 p-3" key={file.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"><FileText size={15} /> Document {index + 1}</div>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => removeDraft(file.id)} title="Remove document"><Trash2 size={15} /></button>
                </div>
                <Field label="Path">
                  <input className={inputClass} value={file.path} onChange={(event) => updateDraft(file.id, { path: event.target.value })} placeholder="docs/notes.md" />
                </Field>
                <Field label="Content" hint="Good for pasted OCR text, interview notes, logs, or content copied from a PDF/DOCX.">
                  <textarea className={`${inputClass} mt-3 min-h-[150px] font-mono text-xs`} value={file.content} onChange={(event) => updateDraft(file.id, { content: event.target.value })} />
                </Field>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className={ghostButtonClass} onClick={addDraft}>Add document</button>
            <button className={ghostButtonClass} onClick={() => setDrafts(starterFiles)}>Load sample</button>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-3">
          <button className={buttonClass} disabled={busy || !canRun} onClick={runPipeline}>
            <span className="inline-flex items-center gap-2"><Sparkles size={16} /> {busy ? "Processing documents..." : "Run document pipeline"}</span>
          </button>
          <button className={ghostButtonClass} onClick={() => { setResult(null); setError(""); }}>Clear</button>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      </div>

      <div className="space-y-5">
        <Panel title="Pipeline report" right={result ? <Badge tone="green">{result.summary.chunkCount} chunks</Badge> : <Badge>not run</Badge>}>
          {result ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Files" value={result.summary.fileCount} />
                <Metric label="Chunks" value={result.summary.chunkCount} />
                <Metric label="High risk" value={result.summary.highRiskFiles} />
                <Metric label="Saved" value={`${result.summary.savedPercent}%`} />
              </div>

              <div className="space-y-3">
                {result.files.map((file) => (
                  <div className="rounded-2xl border border-slate-200 p-3" key={file.fileName}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 font-semibold text-slate-900">{file.fileName}</div>
                      <Badge tone={riskTone(file.risk.label)}>risk {file.risk.label}</Badge>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge>{file.fileKind}</Badge>
                      <Badge>{file.originalTokens} → {file.cleanedTokens} tokens</Badge>
                      <Badge tone="blue">{file.chunks.length} chunks</Badge>
                      <Badge tone={file.suggestedRoute.localPreferred ? "amber" : "green"}>{file.suggestedRoute.providerId} / {file.suggestedRoute.model}</Badge>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{file.suggestedRoute.reason}</p>
                    {file.warnings?.length ? <p className="mt-2 text-xs leading-5 text-amber-700">{file.warnings.join(" ")}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              The report will show file type, risk level, token reduction, chunk count, and suggested model route.
            </div>
          )}
        </Panel>

        <Panel
          title="Export preview"
          right={result ? <button className={ghostButtonClass} onClick={() => navigator.clipboard.writeText(output)}><span className="inline-flex items-center gap-1"><ClipboardCopy size={15} /> Copy</span></button> : null}
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <ViewButton active={view === "markdown"} onClick={() => setView("markdown")}>Markdown</ViewButton>
            <ViewButton active={view === "chunks"} onClick={() => setView("chunks")}>chunks.json</ViewButton>
            <ViewButton active={view === "before"} onClick={() => setView("before")}>Before</ViewButton>
            <ViewButton active={view === "after"} onClick={() => setView("after")}>After</ViewButton>
          </div>
          <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-50 scrollbar-thin">{output}</pre>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? buttonClass : ghostButtonClass} onClick={onClick}>{children}</button>;
}

function getOutput(result: PipelineResult, view: "markdown" | "chunks" | "before" | "after") {
  if (view === "chunks") return result.chunksJson;
  if (view === "before") return result.beforeCleaning;
  if (view === "after") return result.afterCleaning;
  return result.markdown;
}

function riskTone(label?: string): "slate" | "green" | "amber" | "red" | "blue" {
  if (label === "low") return "green";
  if (label === "medium") return "amber";
  if (label === "high" || label === "critical") return "red";
  return "slate";
}
