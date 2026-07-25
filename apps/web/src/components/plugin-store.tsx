"use client";

import { useState } from "react";
import { getBuiltinPlugins, getPluginsByCategory } from "@shared/plugins";
import type { PluginManifest, PluginCategory } from "@shared/agent-runtime/types";
import { Card, CardHeader, Chip, EmptyState, buttonClass, ghostButtonClass } from "./ui";

const CATEGORIES: PluginCategory[] = ["built-in", "output", "knowledge", "media", "api", "computer-use", "dev-tools"];

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  "built-in": "Built-in",
  "output": "Output",
  "knowledge": "Knowledge",
  "media": "Media",
  "api": "API",
  "computer-use": "Computer Use",
  "dev-tools": "Developer Tools",
};

const RISK_COLORS: Record<string, "green" | "amber" | "red"> = { safe: "green", low: "green", medium: "amber", high: "red", critical: "red" };

export function PluginStore() {
  const [filter, setFilter] = useState<PluginCategory | "all">("all");
  const allPlugins = getBuiltinPlugins();
  const plugins = filter === "all" ? allPlugins : getPluginsByCategory(filter);

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Plugin Store</h2>
      <Chip tone="amber">Experimental MVP</Chip>
      <p className="text-sm text-slate-500 dark:text-slate-400">Browse and install plugins. Each plugin runs in a sandboxed local runtime with permission approval.</p>

      <div className="flex flex-wrap gap-2">
        <button className={`${filter === "all" ? buttonClass : ghostButtonClass} text-xs`} onClick={() => setFilter("all")}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`${filter === c ? buttonClass : ghostButtonClass} text-xs`} onClick={() => setFilter(c)}>{CATEGORY_LABELS[c]}</button>
        ))}
      </div>

      {plugins.length === 0 ? (
        <EmptyState title="No plugins in this category" description="Try a different filter or check back later." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plugins.map((p) => (
            <Card key={p.id}>
              <CardHeader
                title={p.name}
                subtitle={p.description}
                action={<Chip tone={p.installed ? "green" : "slate"}>{p.installed ? "Installed" : "Not installed"}</Chip>}
              />
              <div className="flex flex-wrap gap-2 text-xs">
                <Chip tone="blue">v{p.version}</Chip>
                <Chip tone="slate">{p.runtime} runtime</Chip>
                <Chip tone={RISK_COLORS[p.riskLevel]}>{p.riskLevel}</Chip>
                {p.requiresApproval && <Chip tone="amber">Approval required</Chip>}
              </div>
              <div className="mt-3">
                {p.installed ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Installed and ready</span>
                ) : (
                  <button className={buttonClass} onClick={() => {}}>Install Plugin</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}