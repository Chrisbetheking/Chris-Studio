import type { CommandPlan, RuntimeKind } from "./types";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  killed: boolean;
  durationMs: number;
}

/* Browser-side: commands are sent to a local agent server.
   This module defines the plan structure and a mock execution stub for dev/testing. */

export function buildCommandPlan(
  pluginId: string,
  runtime: RuntimeKind,
  command: string,
  args?: string[],
  cwd?: string,
  timeoutMs?: number,
): CommandPlan {
  return { pluginId, command, args, cwd: cwd || ".", timeoutMs: timeoutMs || 30000 };
}

export async function executeLocalCommand(plan: CommandPlan): Promise<CommandResult> {
  /* In production, this POSTs to a local agent HTTP server.
     For now, return a stub indicating the executor is not wired. */
  return {
    exitCode: -1,
    stdout: "",
    stderr: `[agent-runtime] Local executor not connected. Plan: ${plan.pluginId} -> ${plan.command}`,
    killed: false,
    durationMs: 0,
  };
}

export function isCommandSafe(command: string): boolean {
  const blocked = ["rm -rf /", "del /f /s", "format", "shutdown", "reboot", ":(){ :|:& };:"];
  return !blocked.some((b) => command.toLowerCase().includes(b.toLowerCase()));
}