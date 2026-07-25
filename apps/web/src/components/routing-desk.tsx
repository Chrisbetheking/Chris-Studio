"use client";

import { useState } from "react";
import { getRouterRules, routeTask, type RouterRule, type RoutingDecision, type TaskCategory } from "@shared/plugins/model-router";
import { Card, CardHeader, Chip, EmptyState, buttonClass, ghostButtonClass } from "./ui";

const TASK_CATEGORIES: TaskCategory[] = ["general", "code", "document", "creative", "analysis", "safety", "agent"];

export function RoutingDesk() {
  const [rules, setRules] = useState<RouterRule[]>(getRouterRules());
  const [testCategory, setTestCategory] = useState<TaskCategory>("general");
  const [decision, setDecision] = useState<RoutingDecision | null>(null);

  const handleTest = () => {
    const d = routeTask(testCategory);
    setDecision(d);
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Model Routing Rules</h2>
      <Chip tone="amber">Experimental</Chip>
      <p className="text-sm text-slate-500 dark:text-slate-400">Configure per-task-category routing rules with fallback chains. Safety tasks default to local models.</p>

      <Card variant="accent">
        <CardHeader title="Test Route" subtitle="See which model would handle a given task category" />
        <div className="flex flex-wrap gap-2 mb-3">
          {TASK_CATEGORIES.map((c) => (
            <button key={c} className={`${testCategory === c ? buttonClass : ghostButtonClass} text-xs capitalize`} onClick={() => setTestCategory(c)}>{c}</button>
          ))}
        </div>
        <button className={buttonClass} onClick={handleTest}>Test Route</button>
        {decision && (
          <div className="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-1">
            <div className="flex items-center gap-2"><Chip tone="blue">{decision.provider}</Chip><span className="text-sm text-slate-700 dark:text-slate-300">{decision.model}</span></div>
            <div className="flex items-center gap-2"><Chip tone={decision.isFallback ? "amber" : "green"}>{decision.isFallback ? `Fallback #${decision.fallbackIndex}` : "Primary"}</Chip></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{decision.reason}</p>
          </div>
        )}
      </Card>

      {rules.length === 0 ? (
        <EmptyState title="No routing rules configured" description="Default rules are loaded automatically." />
      ) : (
        rules.map((rule) => (
          <Card key={rule.taskCategory}>
            <CardHeader
              title={rule.taskCategory}
              subtitle={`Primary: ${rule.primaryProvider} / ${rule.primaryModel}`}
              action={rule.localPreferred ? <Chip tone="green">Local preferred</Chip> : <Chip tone="slate">Cloud</Chip>}
            />
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Fallback chain: {rule.fallbackChain.join(" → ")}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}