"use client";

import { useState } from "react";
import { Field, Panel, buttonClass, ghostButtonClass, inputClass } from "./ui";

type ContextFile = { id: string; path: string; content: string };

export function ContextPackView() {
  const [task, setTask] = useState("help a coding agent understand this project before editing files");
  const [budget, setBudget] = useState(8000);
  const [files, setFiles] = useState<ContextFile[]>([
    { id: crypto.randomUUID(), path: "package.json", content: '{ "name": "demo", "scripts": { "dev": "next dev" } }' },
    { id: crypto.randomUUID(), path: "src/app/page.tsx", content: 'export default function Page() { return <main>Hello</main>; }' }
  ]);
  const [pack, setPack] = useState("");
  const [busy, setBusy] = useState(false);

  function update(id: string, next: Partial<ContextFile>) {
    setFiles((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/context-pack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, budget, files: files.map(({ path, content }) => ({ path, content })) })
    });
    const json = await res.json();
    setPack(json.pack || json.error || "");
    setBusy(false);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_460px]">
      <Panel title="Agent context pack">
        <div className="space-y-4">
          <Field label="Task">
            <input className={inputClass} value={task} onChange={(event) => setTask(event.target.value)} />
          </Field>
          <Field label="Token budget">
            <input className={inputClass} type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
          </Field>
          <div className="space-y-3">
            {files.map((file, index) => (
              <div key={file.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-700">File {index + 1}</div>
                  <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => setFiles((items) => items.filter((item) => item.id !== file.id))}>remove</button>
                </div>
                <input className={`${inputClass} mb-2`} value={file.path} onChange={(event) => update(file.id, { path: event.target.value })} placeholder="src/app/page.tsx" />
                <textarea className={`${inputClass} min-h-[120px] font-mono`} value={file.content} onChange={(event) => update(file.id, { content: event.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button className={buttonClass} disabled={busy} onClick={generate}>{busy ? "Generating..." : "Generate AGENT_CONTEXT.md"}</button>
            <button className={ghostButtonClass} onClick={() => setFiles((items) => [...items, { id: crypto.randomUUID(), path: "src/file.ts", content: "" }])}>Add file</button>
          </div>
        </div>
      </Panel>

      <Panel title="Output" right={pack ? <button className={ghostButtonClass} onClick={() => navigator.clipboard.writeText(pack)}>Copy</button> : null}>
        <pre className="max-h-[760px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-50 scrollbar-thin">{pack || "Context pack will show here."}</pre>
      </Panel>
    </div>
  );
}
