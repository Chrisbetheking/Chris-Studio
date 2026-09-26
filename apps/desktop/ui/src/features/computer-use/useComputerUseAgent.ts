import { useState, useCallback, useRef } from "react";
import {
  planComputerUseTask,
  runAgentSteps,
  loadAgentState,
  saveAgentState,
  loadAuditLog,
  saveAuditEntry,
  getPermissionMode,
  type ComputerUseAgentState,
  type ComputerUseAgentStep,
  type AgentRunResult,
  type ComputerUsePermissionMode,
  type ComputerUseAuditEntry,
  type ComputerUseRunLog,
} from "../../data/computer-use";

/* v1.5.6 RC6 Shared Computer Use Agent Hook */

export type ComputerUseAgentRequest = {
  source: "chat" | "toolbox";
  task: string;
  conversationId?: string;
  permissionMode: ComputerUsePermissionMode;
};

export function useComputerUseAgent() {
  const [agentState, setAgentState] = useState<ComputerUseAgentState>(loadAgentState);
  const [auditLog, setAuditLog] = useState<ComputerUseAuditEntry[]>(loadAuditLog);
  const stopRef = useRef(false);

  const planTask = useCallback((task: string) => {
    const result = planComputerUseTask(task);
    const newState: ComputerUseAgentState = {
      status: result.blocked ? "blocked" : "planning",
      taskText: task,
      plan: result.plan,
      currentStepIndex: 0,
      logs: [],
      permissionMode: getPermissionMode(),
      updatedAt: Date.now(),
    };
    setAgentState(newState);
    saveAgentState(newState);
    return result;
  }, []);

  const approveRun = useCallback(() => {
    setAgentState(prev => {
      const next = { ...prev, status: "waiting_approval" as const, updatedAt: Date.now() };
      saveAgentState(next);
      return next;
    });
  }, []);

  const denyRun = useCallback(() => {
    setAgentState(prev => {
      const next = { ...prev, status: "stopped" as const, updatedAt: Date.now() };
      saveAgentState(next);
      return next;
    });
  }, []);

  const runPlan = useCallback(async (): Promise<AgentRunResult | null> => {
    if (agentState.plan.length === 0) return null;
    stopRef.current = false;

    const onStateUpdate = (upd: Partial<ComputerUseAgentState>) => {
      setAgentState(prev => {
        const next = { ...prev, ...upd, updatedAt: Date.now() };
        saveAgentState(next);
        return next;
      });
    };

    setAgentState(prev => {
      const next = { ...prev, status: "running", updatedAt: Date.now() };
      saveAgentState(next);
      return next;
    });

    const result = await runAgentSteps(
      agentState.plan,
      agentState.taskText,
      getPermissionMode(),
      onStateUpdate,
      () => stopRef.current,
    );

    saveAuditEntry(result.auditEntry);
    setAuditLog(loadAuditLog());
    return result;
  }, [agentState.plan, agentState.taskText]);

  const stopRun = useCallback(() => {
    stopRef.current = true;
    setAgentState(prev => {
      const next = { ...prev, status: "stopped" as const, updatedAt: Date.now() };
      saveAgentState(next);
      return next;
    });
  }, []);

  const clearAgent = useCallback(() => {
    stopRef.current = false;
    const empty: ComputerUseAgentState = {
      status: "idle", taskText: "", plan: [],
      currentStepIndex: 0, logs: [],
      permissionMode: getPermissionMode(), updatedAt: Date.now(),
    };
    setAgentState(empty);
    saveAgentState(empty);
  }, []);

  return {
    agentState,
    setAgentState,
    auditLog,
    planTask,
    approveRun,
    denyRun,
    runPlan,
    stopRun,
    clearAgent,
  };
}

/* v1.5.6 RC6 Chat intent detector */

export function detectComputerUseIntent(userMessage: string): {
  shouldUseComputer: boolean;
  task: string;
  reason: string;
} | null {
  const lower = userMessage.toLowerCase();

  // Use explicit unicode escapes for Chinese to avoid encoding issues
  var triggers = [
    "notepad",
    "\u8BB0\u4E8B\u672C",     // ???
    "\u6253\u5F00\u8BB0\u4E8B\u672C", // ?????
    "type", "\u8F93\u5165",     // ??
    "write", "\u5199",           // ?
    "open project", "open folder",
    "\u6253\u5F00\u9879\u76EE", // ????
    "\u6253\u5F00\u76EE\u5F55", // ????
    "\u6253\u5F00\u6587\u4EF6\u5939", // ?????
    "check version", "check shortcut",
    "\u68C0\u67E5\u7248\u672C", // ????
    "\u68C0\u67E5\u5FEB\u6377", // ????
    "clean cache", "webview cache",
    "\u6E05\u7406\u7F13\u5B58", // ????
    "\u6E05\u7406",               // ??
    "open url",
    "\u6253\u5F00\u7F51\u5740", // ????
    "run script",
    "\u8FD0\u884C\u811A\u672C", // ????
    "delete all old",
    "\u5220\u9664\u6240\u6709\u65E7", // ?????
    "\u5220\u9664",                     // ??
    "project directory",
    "\u9879\u76EE\u76EE\u5F55",       // ????
    "diagnostic", "release check",
    "\u53D1\u5E03\u68C0\u67E5",       // ????
    "guard source",
    "\u9632\u62A4",                     // ??
  ];

  var matched = triggers.some(function(t: string) { return lower.indexOf(t.toLowerCase()) >= 0; });
  if (!matched) return null;

  var blockedTriggers = [
    "delete all old",
    "\u5220\u9664\u6240\u6709\u65E7", // ?????
    "remove all", "del ", "rm ",
  ];
  var isBlocked = blockedTriggers.some(function(t: string) { return lower.indexOf(t.toLowerCase()) >= 0; });

  return {
    shouldUseComputer: true,
    task: userMessage,
    reason: isBlocked
      ? "User requested a potentially destructive action"
      : "User requested local computer action",
  };
}
