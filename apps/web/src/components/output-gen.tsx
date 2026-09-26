"use client";

import { useState } from "react";
import { exportContent, type OutputResult } from "@shared/plugins/output-generators";
import { generateMindMap, buildMindMapNode, parseToMindMap, type MindMapOutput } from "@shared/plugins/mindmap";
import { Card, CardHeader, Chip, EmptyState, buttonClass, ghostButtonClass } from "./ui";

const FORMATS: Array<OutputResult["format"]> = ["md", "html", "json", "pdf", "docx"];

export function OutputGen() {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("output");
  const [format, setFormat] = useState<OutputResult["format"]>("md");
  const [results, setResults] = useState<OutputResult[]>([]);
  const [mindMap, setMindMap] = useState<MindMapOutput | null>(null);

  const handleExport = () => {
    const result = exportContent(content, title, format);
    setResults((prev) => [result, ...prev].slice(0, 10));
    if (window.navigator?.clipboard) {
      navigator.clipboard.writeText(result.content).catch(() => {});
    }
  };

  const handleMindMap = () => {
    const root = content.trim() ? parseToMindMap(content, title) : buildMindMapNode(title, [buildMindMapNode("Topic 1"), buildMindMapNode("Topic 2")]);
    const mm = generateMindMap(root, "mermaid");
    setMindMap(mm);
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Output Generation</h2>
      <Chip tone="amber">MVP</Chip>
      <p className="text-sm text-slate-500 dark:text-slate-400">Export agent output to Markdown, HTML, JSON, PDF, DOCX, or generate mind maps.</p>

      <Card>
        <CardHeader title="Export Content" subtitle="Enter text and choose format" />
        <input className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm mb-3" placeholder="Output title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm min-h-[120px] mb-3" placeholder="Paste agent output here..." value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="flex flex-wrap gap-2 mb-3">
          {FORMATS.map((f) => (
            <button key={f} className={`${format === f ? buttonClass : ghostButtonClass} text-xs uppercase`} onClick={() => setFormat(f)}>{f}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className={buttonClass} onClick={handleExport} disabled={!content.trim()}>Export {format.toUpperCase()}</button>
          <button className={ghostButtonClass} onClick={handleMindMap}>Generate Mind Map</button>
        </div>
      </Card>

      {mindMap && (
        <Card variant="accent">
          <CardHeader title="Mind Map" subtitle="Mermaid syntax output" />
          <pre className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 text-xs overflow-x-auto">{mindMap.content}</pre>
        </Card>
      )}

      {results.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Recent Exports</h3>
          {results.map((r, i) => (
            <Card key={i}>
              <CardHeader title={r.filename} subtitle={new Date(r.generatedAt).toLocaleTimeString()} action={<Chip tone="blue">{r.format.toUpperCase()}</Chip>} />
              <pre className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-xs max-h-40 overflow-y-auto">{r.content.slice(0, 500)}</pre>
            </Card>
          ))}
        </div>
      )}

      {!mindMap && results.length === 0 && (
        <EmptyState title="No exports yet" description="Enter content above and choose a format to export." />
      )}
    </div>
  );
}