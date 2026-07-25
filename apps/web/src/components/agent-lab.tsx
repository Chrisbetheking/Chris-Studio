"use client";

import { useState } from "react";
import { createTask, listTasks, updateStepStatus, setTaskStatus, appendLog } from "@shared/agent-runtime";
import type { AgentTask, AgentStep } from "@shared/agent-runtime/types";
import { Card, CardHeader, Chip, EmptyState, buttonClass } from "./ui";

const MOCK_CATEGORIES = ["Research", "Code Review", "Document Processing", "Data Analysis", "Safety Scan"];

function buildDemoSteps(category: string): AgentStep[] {
  return [
    { id: `s1-${Date.now()}`, order: 1, label: "Analyze input", pluginId: "builtin", action: "analyze", status: "pending" },
    { id: `s2-${Date.now()}`, order: 2, label: "Route to provider", pluginId: "model-router", action: "route", status: "pending" },
    { id: `s3-${Date.now()}`, order: 3, label: "Execute plugin", pluginId: "builtin", action: "execute", status: "pending" },
    { id: `s4-${Date.now()}`, order: 4, label: "Generate output", pluginId: "output-generators", action: "export", status: "pending" },
  ];
}

export function AgentLab() {
  const [tasks, setTasks] = useState<AgentTask[]>(listTasks());
  const [selectedCategory, setSelectedCategory] = useState("Research");

  const refresh = () => setTasks(listTasks());

  const handleCreate = () => {
    const steps = buildDemoSteps(selectedCategory);
    const task = createTask(`${selectedCategory} task`, selectedCategory.toLowerCase(), steps);
    appendLog({ taskId: task.id, pluginId: "agent-lab", level: "info", message: `Created task: ${task.label}` });
    refresh();
  };

  const handleRun = (taskId: string) => {
    setTaskStatus(taskId, "running");
    appendLog({ taskId, pluginId: "agent-lab", level: "info", message: "Task started" });
    const task = listTasks().find((t) => t.id === taskId);
    if (task) {
      task.steps.forEach((s, i) => {
        setTimeout(() => {
          updateStepStatus(taskId, s.id, "complete", { result: `Step ${i + 1} done` });
          if (i === task.steps.length - 1) {
            setTaskStatus(taskId, "complete");
            appendLog({ taskId, pluginId: "agent-lab", level: "info", message: "Task completed" });
          }
          refresh();
        }, (i + 1) * 600);
      });
    }
    refresh();
  };

  const statusChip = (status: string) => {
    const map: Record<string, "slate" | "blue" | "green" | "red" | "amber"> = { pending: "slate", running: "blue", complete: "green", failed: "red", cancelled: "amber", skipped: "amber" };
    return <Chip tone={map[status] || "slate"}>{status}</Chip>;
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Agent Lab</h2>
      <Chip tone="amber">Experimental</Chip>
      <p className="text-sm text-slate-500 dark:text-slate-400">Lightweight local agent task workspace. Define workflows, approve plugin steps, and monitor execution.</p>

      <Card variant="accent">
        <CardHeader title="New Agent Task" subtitle="Select a category and create a task" />
        <div className="flex flex-wrap gap-3">
          <select className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            {MOCK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className={buttonClass} onClick={handleCreate}>Create Task</button>
        </div>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState title="No agent tasks yet" description="Create your first agent task above to get started." />
      ) : (
        tasks.map((task) => (
          <Card key={task.id}>
            <CardHeader title={task.label} subtitle={task.category} action={statusChip(task.status)} />
            <div className="space-y-2 mb-4">
              {task.steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="w-5 text-center text-xs text-slate-400">{step.order}</span>
                  <span className="flex-1">{step.label}</span>
                  {statusChip(step.status)}
                </div>
              ))}
            </div>
            {task.status === "pending" && (
              <button className={buttonClass} onClick={() => handleRun(task.id)}>Run Task</button>
            )}
            {task.status === "complete" && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">All steps completed successfully.</p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}