"use client";

import { useState } from "react";
import type { GuardMode, PolicyId } from "@/lib/types";
import { Badge, Field, Panel, buttonClass, ghostButtonClass, inputClass } from "./ui";

type GuardResponse = {
  safePrompt?: string;
  finalPrompt?: string;
  redacted?: string;
  compressed?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  savedPercent?: number;
  detections?: Array<{ label: string; value: string; severity: string }>;
  riskBefore?: { label: string; score: number };
  riskAfter?: { label: string; score: number };
  policy?: string;
  effectiveMode?: string;
  action?: { label: string; reason: string; requiresConfirmation?: boolean };
  routing?: { label: string; providerId?: string; model?: string; reason: string; localPreferred?: boolean };
  error?: string;
};

export function GuardDesk() {
  const [text, setText] = useState(sample);
  const [question, setQuestion] = useState("turn this into a clean prompt for a coding agent");
  const [budget, setBudget] = useState(3000);
  const [mode, setMode] = useState<GuardMode>("safe");
  const [policy, setPolicy] = useState<PolicyId>("balanced");
  const [result, setResult] = useState<GuardResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await fetch("/api/guard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, question, budget, mode, policy })
    });
    setResult(await res.json());
    setBusy(false);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Prompt guard">
        <div className="space-y-4">
          <Field label="Raw content">
            <textarea className={`${inputClass} min-h-[360px] font-mono`} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <Field label="Question / task">
            <input className={inputClass} value={question} onChange={(event) => setQuestion(event.target.value)} />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Policy">
              <select className={inputClass} value={policy} onChange={(event) => setPolicy(event.target.value as PolicyId)}>
                <option value="strict">strict privacy</option>
                <option value="balanced">balanced</option>
                <option value="fast">fast</option>
                <option value="developer">developer debug</option>
              </select>
            </Field>
            <Field label="Mode">
              <select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value as GuardMode)}>
                <option value="safe">redact + compress</option>
                <option value="redact-only">redact only</option>
                <option value="compress-only">compress only</option>
              </select>
            </Field>
            <Field label="Budget">
              <input className={inputClass} type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
            </Field>
          </div>
          <button className={buttonClass} disabled={busy || !text.trim()} onClick={run}>{busy ? "Checking..." : "Run guard"}</button>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel title="Safety report">
          {result?.error ? <p className="text-sm text-red-600">{result.error}</p> : null}
          {result?.tokensBefore !== undefined ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">{result.tokensBefore} → {result.tokensAfter} tokens</Badge>
                <Badge tone="green">saved {result.savedPercent}%</Badge>
                <Badge tone={result.riskBefore?.label === "low" ? "green" : "red"}>risk {result.riskBefore?.label} → {result.riskAfter?.label}</Badge>
                {result.policy ? <Badge tone="amber">{result.policy}</Badge> : null}
                {result.effectiveMode ? <Badge tone="blue">{result.effectiveMode}</Badge> : null}
              </div>
              {result.action ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="mb-1 font-medium">Action</div>
                  <div className="font-semibold text-slate-800">{result.action.label}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{result.action.reason}</p>
                </div>
              ) : null}
              {result.routing ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="mb-1 font-medium">Routing</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone={result.routing.localPreferred ? "amber" : "blue"}>{result.routing.label}</Badge>
                    {result.routing.providerId ? <Badge>{result.routing.providerId}</Badge> : null}
                    {result.routing.model ? <Badge>{result.routing.model}</Badge> : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{result.routing.reason}</p>
                </div>
              ) : null}
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 font-medium">Findings</div>
                {result.detections?.length ? result.detections.map((item, index) => (
                  <div className="mb-1 text-slate-600" key={index}>{item.label} <span className="text-slate-400">({item.severity})</span></div>
                )) : <div className="text-slate-500">Nothing obvious found.</div>}
              </div>
            </div>
          ) : <p className="text-sm text-slate-500">Run the guard to see the report.</p>}
        </Panel>

        <Panel title="Safe prompt" right={result?.safePrompt ? <button className={ghostButtonClass} onClick={() => navigator.clipboard.writeText(result.finalPrompt || result.safePrompt || "")}>Copy</button> : null}>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-50 scrollbar-thin">{result?.finalPrompt || result?.safePrompt || "Safe prompt will show here."}</pre>
        </Panel>
      </div>
    </div>
  );
}

const sample = `Meeting notes\n\nClient: Acme Pay CN\nContact: wang.lei@example.com / 13900001111\nDB: mysql://root:secret@192.168.1.9:3306/payments\n\nWe need an AI assistant page. It should let users bring their own keys, compare providers, and save prompt history locally. The login page can wait. Focus on the model gateway and local archive.`;
