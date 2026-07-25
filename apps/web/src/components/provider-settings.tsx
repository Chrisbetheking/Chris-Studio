"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Field, Panel, buttonClass, ghostButtonClass, inputClass } from "./ui";
import type { ProviderSpec } from "@/lib/types";

type SavedPublic = {
  providerId: string;
  model?: string;
  baseUrl?: string;
  enabled?: boolean;
  hasKey?: boolean;
};

type ProviderResponse = {
  providers: ProviderSpec[];
  saved: SavedPublic[];
};

const groups = {
  global: "Global",
  china: "China",
  router: "Router",
  local: "Local",
  custom: "Custom"
};

export function ProviderSettings({ onSaved }: { onSaved?: () => void }) {
  const [data, setData] = useState<ProviderResponse>({ providers: [], saved: [] });
  const [active, setActive] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/providers");
    const json = await res.json();
    setData(json);
    if (!active && json.providers?.length) setActive(json.providers[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  const provider = data.providers.find((item) => item.id === active);
  const saved = data.saved.find((item) => item.providerId === active);

  useEffect(() => {
    if (!provider) return;
    setApiKey("");
    setModel(saved?.model || provider.defaultModel);
    setBaseUrl(saved?.baseUrl || provider.baseUrl);
    setMessage("");
  }, [active, provider?.id, saved?.model, saved?.baseUrl]);

  const byGroup = useMemo(() => {
    return data.providers.reduce<Record<string, ProviderSpec[]>>((map, item) => {
      map[item.group] = map[item.group] || [];
      map[item.group].push(item);
      return map;
    }, {});
  }, [data.providers]);

  async function save() {
    if (!provider) return;
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: provider.id, apiKey: apiKey || undefined, model, baseUrl, enabled: true })
    });

    setBusy(false);
    if (!res.ok) {
      setMessage("Save failed.");
      return;
    }

    setMessage("Saved locally.");
    setApiKey("");
    await load();
    onSaved?.();
  }

  async function test() {
    if (!provider) return;
    setBusy(true);
    setMessage("Testing...");

    const res = await fetch("/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: provider.id, model })
    });

    const json = await res.json();
    setBusy(false);
    setMessage(json.ok ? `Connected in ${json.durationMs}ms.` : json.error || "Connection failed.");
  }

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 scrollbar-thin lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
      <Panel title="Providers" className="min-h-0 overflow-y-auto scrollbar-thin lg:h-full">
        {Object.entries(byGroup).map(([group, providers]) => (
          <div key={group} className="mb-5 last:mb-0">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{groups[group as keyof typeof groups] || group}</div>
            <div className="space-y-1">
              {providers.map((item) => {
                const itemSaved = data.saved.find((savedItem) => savedItem.providerId === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                      active === item.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${itemSaved?.hasKey || !item.needsKey ? "bg-emerald-400" : "bg-slate-300"}`} />
                      {item.label}
                    </span>
                    {itemSaved?.hasKey || !item.needsKey ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">active</span> : <span className="text-[11px] opacity-60">no key</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Panel>

      <Panel
        className="min-h-0 overflow-y-auto scrollbar-thin lg:h-full"
        title={provider?.label || "Provider"}
        right={saved?.hasKey || provider?.needsKey === false ? <Badge tone="green">configured</Badge> : <Badge tone="amber">needs key</Badge>}
      >
        {provider ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Model">
                <select className={inputClass} value={model} onChange={(event) => setModel(event.target.value)}>
                  {provider.models.map((name) => <option key={name}>{name}</option>)}
                </select>
              </Field>
              <Field label="API Key" hint={provider.needsKey ? "Saved to the local .tokenfence folder." : "Usually blank for local providers."}>
                <input
                  className={inputClass}
                  type="password"
                  placeholder={saved?.hasKey ? "Saved. Paste a new key to replace." : provider.needsKey ? "Paste API key" : "Optional"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Base URL" hint="Built in by default. Advanced users can change it here.">
              <input className={inputClass} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </Field>

            {provider.note ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{provider.note}</p> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button disabled={busy} className={buttonClass} onClick={save}>Save</button>
              <button disabled={busy} className={ghostButtonClass} onClick={test}>Test connection</button>
              {message ? <span className="text-sm text-slate-600">{message}</span> : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
