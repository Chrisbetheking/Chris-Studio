"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderSpec } from "@/lib/types";
import { Badge, inputClass } from "./ui";

type SavedPublic = {
  providerId: string;
  model?: string;
  hasKey?: boolean;
  enabled?: boolean;
};

type ProviderResponse = {
  providers: ProviderSpec[];
  saved: SavedPublic[];
};

function isReady(provider: ProviderSpec, saved?: SavedPublic) {
  return provider.needsKey ? Boolean(saved?.hasKey) : true;
}

function firstReadyProvider(data: ProviderResponse) {
  return data.providers.find((provider) => {
    const saved = data.saved.find((item) => item.providerId === provider.id);
    return isReady(provider, saved);
  }) || data.providers[0];
}

export function ProviderPicker({ value, model, onChange, readyKey = 0, compact = false }: {
  value: string;
  model: string;
  readyKey?: number;
  compact?: boolean;
  onChange: (next: { providerId: string; model: string }) => void;
}) {
  const [data, setData] = useState<ProviderResponse>({ providers: [], saved: [] });

  useEffect(() => {
    fetch("/api/providers").then((res) => res.json()).then((json: ProviderResponse) => {
      setData(json);

      const current = json.providers.find((item) => item.id === value);
      const currentSaved = json.saved?.find((item) => item.providerId === value);
      const shouldAutoPick = !current || !isReady(current, currentSaved);

      if (shouldAutoPick) {
        const nextProvider = firstReadyProvider(json);
        if (nextProvider) {
          const nextSaved = json.saved?.find((item) => item.providerId === nextProvider.id);
          onChange({ providerId: nextProvider.id, model: nextSaved?.model || nextProvider.defaultModel });
        }
      }
    });
  }, [readyKey]);

  const provider = data.providers.find((item) => item.id === value);
  const saved = data.saved.find((item) => item.providerId === value);
  const ready = provider ? isReady(provider, saved) : false;
  const readyCount = data.providers.filter((item) => isReady(item, data.saved.find((savedItem) => savedItem.providerId === item.id))).length;
  const models = useMemo(() => provider?.models || [], [provider]);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <select
          className={`${inputClass} ${compact ? "py-2" : ""}`}
          value={value}
          onChange={(event) => {
            const nextProvider = data.providers.find((item) => item.id === event.target.value);
            const nextSaved = data.saved.find((item) => item.providerId === event.target.value);
            onChange({ providerId: event.target.value, model: nextSaved?.model || nextProvider?.defaultModel || "" });
          }}
        >
          {data.providers.map((item) => {
            const itemSaved = data.saved.find((savedItem) => savedItem.providerId === item.id);
            const itemReady = isReady(item, itemSaved);
            const suffix = itemReady ? "active" : item.needsKey ? "no key" : "local";
            return <option key={item.id} value={item.id}>{`${itemReady ? "●" : "○"} ${item.label} · ${suffix}`}</option>;
          })}
        </select>

        <select
          className={`${inputClass} ${compact ? "py-2" : ""}`}
          value={model || saved?.model || provider?.defaultModel || ""}
          onChange={(event) => onChange({ providerId: value, model: event.target.value })}
        >
          {(models.length ? models : [model]).filter(Boolean).map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {provider ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-400"}`} />
            {ready ? "Active" : "API key needed"}
          </span>
        ) : null}
        <Badge tone="green">{readyCount} active</Badge>
        {!compact ? <span>Default picks the first active provider automatically.</span> : null}
      </div>
    </div>
  );
}
