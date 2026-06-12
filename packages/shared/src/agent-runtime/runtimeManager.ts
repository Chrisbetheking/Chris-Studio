import type { AgentTask, AgentStep, ExecutionLogEntry, SkillResult } from "./types";

const tasks = new Map<string, AgentTask>();
const logs: ExecutionLogEntry[] = [];

let logCounter = 0;
function nextLogId(): string { return `log-${Date.now()}-${++logCounter}`; }

export function createTask(label: string, category: string, steps: AgentStep[]): AgentTask {
  const task: AgentTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    category,
    steps,
    createdAt: Date.now(),
    status: "pending",
    permissions: [],
  };
  tasks.set(task.id, task);
  return task;
}

export function getTask(taskId: string): AgentTask | undefined {
  return tasks.get(taskId);
}

export function listTasks(): AgentTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateStepStatus(taskId: string, stepId: string, status: AgentStep["status"], output?: unknown, error?: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) return;
  step.status = status;
  if (output !== undefined) step.output = output;
  if (error) step.error = error;
}

export function setTaskStatus(taskId: string, status: AgentTask["status"]): void {
  const task = tasks.get(taskId);
  if (task) task.status = status;
}

export function appendLog(entry: Omit<ExecutionLogEntry, "id" | "timestamp">): ExecutionLogEntry {
  const full: ExecutionLogEntry = { ...entry, id: nextLogId(), timestamp: Date.now() };
  logs.push(full);
  return full;
}

export function getLogs(taskId?: string): ExecutionLogEntry[] {
  if (taskId) return logs.filter((l) => l.taskId === taskId);
  return [...logs];
}

export function buildSkillResult(pluginId: string, taskId: string, success: boolean, output?: unknown, error?: string, durationMs = 0): SkillResult {
  return {
    pluginId,
    success,
    output,
    error,
    durationMs,
    logs: logs.filter((l) => l.taskId === taskId),
    artifacts: [],
  };
}