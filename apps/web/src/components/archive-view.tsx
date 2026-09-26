"use client";

import { useEffect, useState } from "react";
import { Badge, Field, Panel, ghostButtonClass, inputClass } from "./ui";

type ArchiveRecord = {
  id: string;
  title: string;
  providerId: string;
  model: string;
  promptBefore: string;
  promptAfter: string;
  response: string;
  tokensInput: number;
  tokensOutput: number;
  riskBefore: { label: string; score: number };
  riskAfter: { label: string; score: number };
  durationMs: number;
  createdAt: string;
  tags: string[];
};

export function ArchiveView() {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [selected, setSelected] = useState<ArchiveRecord | null>(null);

  async function load(q = query) {
    const res = await fetch(`/api/archive?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setRecords(json.records || []);
    if (!selected && json.records?.[0]) setSelected(json.records[0]);
  }

  useEffect(() => {
    load("");
  }, []);

  async function remove(id: string) {
    await fetch(`/api/archive?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSelected(null);
    load();
  }

  async function clearAll() {
    if (!confirm("Clear all archive records on this machine?")) return;
    await fetch("/api/archive?all=1", { method: "DELETE" });
    setSelected(null);
    setRecords([]);
  }

  function exportMarkdown(record: ArchiveRecord) {
    const md = [`# ${record.title}`, "", `Provider: ${record.providerId}`, `Model: ${record.model}`, `Created: ${record.createdAt}`, "", "## Safe prompt", "", record.promptAfter, "", "## Response", "", record.response].join("\n");
    download(`${record.id}.md`, md, "text/markdown");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Panel title="Archive" right={records.length ? <button className={ghostButtonClass} onClick={clearAll}>Clear all</button> : null}>
        <div className="space-y-4">
          <Field label="Search">
            <input
              className={inputClass}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                load(event.target.value);
              }}
              placeholder="model, tag, prompt..."
            />
          </Field>

          <div className="max-h-[650px] space-y-2 overflow-auto pr-1 scrollbar-thin">
            {records.map((record) => (
              <button
                key={record.id}
                onClick={() => setSelected(record)}
                className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === record.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <div className="line-clamp-2 text-sm font-medium text-slate-900">{record.title}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge>{record.providerId}</Badge>
                  <Badge tone="blue">{record.tokensInput + record.tokensOutput} tokens</Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500">{new Date(record.createdAt).toLocaleString()}</div>
              </button>
            ))}
            {!records.length ? <p className="text-sm text-slate-500">No archive records yet.</p> : null}
          </div>
        </div>
      </Panel>

      <Panel
        title={selected?.title || "Record"}
        right={selected ? (
          <div className="flex gap-2">
            <button className={ghostButtonClass} onClick={() => exportMarkdown(selected)}>Export MD</button>
            <button className={ghostButtonClass} onClick={() => remove(selected.id)}>Delete</button>
          </div>
        ) : null}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>{selected.providerId}</Badge>
              <Badge>{selected.model}</Badge>
              <Badge tone={selected.riskBefore.label === "low" ? "green" : "amber"}>risk {selected.riskBefore.label} → {selected.riskAfter.label}</Badge>
              <Badge tone="blue">{selected.durationMs}ms</Badge>
            </div>
            <Detail title="Safe prompt" text={selected.promptAfter} />
            <Detail title="Response" text={selected.response} />
          </div>
        ) : <p className="text-sm text-slate-500">Pick a record from the list.</p>}
      </Panel>
    </div>
  );
}

function Detail({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-700">{title}</div>
      <pre className="max-h-[340px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-50 scrollbar-thin">{text}</pre>
    </div>
  );
}

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
