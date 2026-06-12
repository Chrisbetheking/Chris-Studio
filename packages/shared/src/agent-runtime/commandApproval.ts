import type { CommandPlan, ExecutionLogEntry } from "./types";
import { addEntry } from "./executionLog";

const pendingCommands: CommandPlan[] = [];
const executedHistory: Array<{ plan: CommandPlan; result: string; at: number }> = [];

export function submitCommand(plan: CommandPlan): void {
  pendingCommands.push(plan);
  addEntry({
    taskId: plan.pluginId,
    stepId: undefined,
    pluginId: plan.pluginId,
    level: "info",
    message: `Command queued for approval: ${plan.command}`,
  });
}

export function approveCommand(index: number): CommandPlan | null {
  if (index < 0 || index >= pendingCommands.length) return null;
  const plan = pendingCommands.splice(index, 1)[0];
  executedHistory.push({ plan, result: "approved", at: Date.now() });
  addEntry({
    taskId: plan.pluginId,
    stepId: undefined,
    pluginId: plan.pluginId,
    level: "info",
    message: `Command approved: ${plan.command}`,
  });
  return plan;
}

export function rejectCommand(index: number): CommandPlan | null {
  if (index < 0 || index >= pendingCommands.length) return null;
  const plan = pendingCommands.splice(index, 1)[0];
  addEntry({
    taskId: plan.pluginId,
    stepId: undefined,
    pluginId: plan.pluginId,
    level: "warn",
    message: `Command rejected: ${plan.command}`,
  });
  return plan;
}

export function listPendingCommands(): CommandPlan[] {
  return [...pendingCommands];
}

export function listCommandHistory(): Array<{ plan: CommandPlan; result: string; at: number }> {
  return [...executedHistory];
}