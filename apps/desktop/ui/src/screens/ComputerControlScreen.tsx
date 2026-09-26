import { useState, useEffect, useCallback, useRef } from "react";
import { useComputerUseAgent } from "../features/computer-use/useComputerUseAgent";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import {
  loadComputerUseState,
  saveComputerUseState,
  executeStep,
  loadAuditLog,
  saveAuditEntry,
  clearAuditLog,
  assessRiskLevel,
  ENTERPRISE_POLICY,
  getPermissionMode,
  setPermissionMode,
  evaluateComputerUsePermission,
  type ComputerUseState,
  type ComputerUsePlanStep,
  type ComputerUseRunLog,
  type ComputerUseAuditEntry,
  type ComputerUsePermissionMode,
} from "../data/computer-use";

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function logLevelColor(level: string): string {
  switch (level) {
    case "success": return "var(--green)";
    case "error": return "var(--red)";
    case "warning": return "var(--amber)";
    default: return "var(--text-muted)";
  }
}

function riskColor(risk: string): string {
  switch (risk) {
    case "safe": return "var(--green)";
    case "review": return "var(--amber)";
    case "blocked": return "var(--red)";
    default: return "var(--text-muted)";
  }
}

function riskLabel(risk: string, isZh: boolean): string {
  switch (risk) {
    case "safe": return isZh ? "安全" : "Safe";
    case "review": return isZh ? "需审核" : "Review";
    case "blocked": return isZh ? "已阻止" : "Blocked";
    default: return risk;
  }
}

export function ComputerControlScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);

  const isZh = tk("common.yes") !== "Yes";
  const {
    agentState,
    setAgentState,
    auditLog,
    setAuditLog: setAuditLogState,
    planTask,
    runPlan,
    stopRun: stopAgentRun,
    clearAgent,
  } = useComputerUseAgent();

  const [state, setState] = useState<ComputerUseState>(loadComputerUseState);
  const [taskInput, setTaskInput] = useState(state.taskText || "");
    // auditLog managed by useComputerUseAgent
  const [dryRunLogs, setDryRunLogs] = useState<ComputerUseRunLog[] | null>(null);
  const [currentRiskLevel, setCurrentRiskLevel] = useState<string>("low");
  const [permissionMode, setPermissionModeState] = useState<ComputerUsePermissionMode>(getPermissionMode);
  const [showFullAccessConfirm, setShowFullAccessConfirm] = useState(false);
  const stopRef = useRef(false);

  const persist = useCallback((s: ComputerUseState) => {
    saveComputerUseState(s);
    setState(s);
  }, []);

  const handlePermissionModeChange = useCallback((mode: ComputerUsePermissionMode) => {
    if (mode === "full_access") {
      setShowFullAccessConfirm(true);
      return;
    }
    setPermissionModeState(mode);
    setPermissionMode(mode);
  }, []);

  const handleFullAccessConfirm = useCallback(() => {
    setShowFullAccessConfirm(false);
    setPermissionModeState("full_access");
    setPermissionMode("full_access");
  }, []);

  const handleFullAccessCancel = useCallback(() => {
    setShowFullAccessConfirm(false);
  }, []);

  const handleGeneratePlan = useCallback(() => {
    if (!taskInput.trim()) return;
    const newState: ComputerUseState = {
      ...state,
      taskText: taskInput.trim(),
      status: "planning",
      plan: [],
      logs: [],
    };
    persist(newState);

    setTimeout(() => {
      const result = generatePlan(taskInput.trim());
      const planned: ComputerUseState = {
        ...newState,
        status: result.blocked ? "failed" : "waiting_confirmation",
        plan: result.plan,
        logs: [{
          id: uid(), time: Date.now(),
          level: result.blocked ? "error" : "info",
          message: result.blocked
            ? (isZh ? "任务被阻止：输入包含不允许的操作。" : "Task blocked: input contains disallowed operations.")
            : (isZh ? `已生成 ${result.plan.length} 个计划步骤。请审核后确认执行。` : `Generated ${result.plan.length} plan step(s). Review and confirm to execute.`),
        }],
      };
      persist(planned);
    }, 600);
  }, [taskInput, state, persist, isZh]);

  const handleDryRun = useCallback(() => {
    if (state.status !== "waiting_confirmation") return;
    const dryLogs: ComputerUseRunLog[] = [{
      id: uid(), time: Date.now(), level: "info",
      message: isZh ? "干跑模式（Dry Run）：不会执行任何实际操作。" : "Dry Run mode: no actions will be executed.",
    }];
    for (const step of state.plan) {
      dryLogs.push({
        id: uid(), time: Date.now(), level: "info",
        message: `[DRY RUN] ${step.title}: ${step.description}`,
      });
    }
    dryLogs.push({
      id: uid(), time: Date.now(), level: "success",
      message: isZh ? `干跑完成。${state.plan.length} 个步骤已检查，未执行任何实际动作。` : `Dry run complete. ${state.plan.length} step(s) reviewed. No actions were taken.`,
    });
    setDryRunLogs(dryLogs);
  }, [state, isZh]);

  const handleConfirmRun = useCallback(async () => {
    if (state.status !== "waiting_confirmation") return;
    if (agentState.plan.length === 0) return;
    
    stopRef.current = false;
    
    const runningState: ComputerUseState = {
      ...state,
      status: "running",
      logs: [...state.logs, {
        id: uid(), time: Date.now(), level: "info",
        message: isZh ? "??????..." : "Starting plan execution...",
      }],
    };
    persist(runningState);
    
    const onStateUpdate = (upd: Partial<ComputerUseAgentState>) => {
      setAgentState(prev => {
        const next = { ...prev, ...upd, updatedAt: Date.now() };
        saveAgentState(next);
        return next;
      });
      // Sync logs to old state for compatibility
      if (upd.logs) {
        setState(prev => ({ ...prev, logs: upd.logs || prev.logs }));
      }
    };
    
    const result: AgentRunResult = await runAgentSteps(
      agentState.plan,
      state.taskText,
      permissionMode,
      onStateUpdate,
      () => stopRef.current,
    );
    
    const finalState: ComputerUseState = {
      ...state,
      status: result.status === "completed" ? "completed" : result.status === "stopped" ? "stopped" : "failed",
      logs: result.logs,
    };
    persist(finalState);
    
    saveAuditEntry(result.auditEntry);
    setAuditLogState(loadAuditLog());
  }, [state, persist, isZh, agentState, permissionMode]);


  const handleClearAudit = useCallback(() => {
    clearAuditLog();
    setAuditLogState([]);
  }, []);

  const handleStop = useCallback(() => {
    stopAgentRun();
    const stoppedState: ComputerUseState = {
      ...state, status: "stopped",
      logs: [...state.logs, {
        id: uid(), time: Date.now(), level: "warning",
        message: isZh ? "???????" : "Stop requested by user.",
      }],
    };
    persist(stoppedState);
  }, [state, persist, isZh, stopAgentRun]);

  const handleClear = useCallback(() => {
    setTaskInput("");
    clearAgent();
    persist({
      taskText: "", status: "idle", plan: [], logs: [], updatedAt: Date.now(),
    });
  }, [persist, clearAgent]);

  const canGenerate = taskInput.trim().length > 0 &&
    (state.status === "idle" || state.status === "completed" || state.status === "failed" || state.status === "stopped");
  const canConfirm = state.status === "waiting_confirmation";
  const canStop = state.status === "running";
  const isBusy = state.status === "planning" || state.status === "running";

  return (
    <div style={{ padding: "28px 32px", height: "100%", overflowY: "auto" }}>
      <h1 className="page-title">{tk("computerUse.title")}</h1>
      <p className="page-subtitle">{tk("computerUse.subtitle")}</p>

      {/* Safety Notice */}
      <div className="card" style={{
        marginBottom: 16, padding: 12,
        background: "var(--surface-alt)",
        border: "1px solid var(--amber)",
        fontSize: "0.75rem", color: "var(--text-secondary)",
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {/* Computer Use Diagnostics Preview / 预览版 */}{tk("computerUse.previewNotice")}
        </div>
        <div>{tk("computerUse.previewDescription")}</div>
      </div>

      {/* Task Input */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
          {tk("computerUse.taskDescription")}
        </div>
        <textarea
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canGenerate) handleGeneratePlan(); } }}
          placeholder={tk("computerUse.taskPlaceholder")}
          style={{
            width: "100%", minHeight: 60,
            background: "var(--bg)", color: "var(--text)",
            border: "1px solid var(--border)", borderRadius: 4,
            padding: 8, fontSize: "0.8rem", resize: "vertical",
            fontFamily: "inherit",
          }}
          disabled={isBusy}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={!canGenerate} style={{ fontSize: "0.75rem" }}>
            {tk("computerUse.generatePlan")}
          </button>
          <button className="btn btn-ghost" onClick={handleClear} disabled={isBusy || state.status === "idle"} style={{ fontSize: "0.75rem" }}>
            {tk("computerUse.clear")}
          </button>
        </div>
      </div>

      {/* Status */}
      {state.status !== "idle" && (
        <div style={{ marginBottom: 8, fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {tk("computerUse.status")}: <strong>{state.status}</strong>
        </div>
      )}

      {/* Plan Preview */}
      {state.plan.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
            {tk("computerUse.executionPlan")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Map old plan steps, overlay agent status */}
            {state.plan.map((step: ComputerUsePlanStep, i: number) => {
              const agentStep = agentState.plan.find(s => s.id === step.id);
              const stepStatus = agentStep?.status || "pending";
              const statusColor = stepStatus === "success" ? "var(--green)" : stepStatus === "failed" ? "var(--red)" : stepStatus === "running" ? "var(--accent)" : stepStatus === "blocked" ? "var(--red)" : stepStatus === "skipped" ? "var(--amber)" : "var(--text-muted)";
              return (
                <div key={step.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
                  borderBottom: "1px solid var(--border)", opacity: stepStatus === "skipped" ? 0.5 : 1,
                }}>
                  <span style={{ color: statusColor, fontSize: "0.8rem", flexShrink: 0, marginTop: 2 }}>
                    {stepStatus === "success" ? "✔" : stepStatus === "failed" ? "✖" : stepStatus === "running" ? "▶" : stepStatus === "blocked" ? "⛔" : stepStatus === "skipped" ? "⏭" : "○"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: stepStatus === "running" ? 700 : 500, fontSize: "0.75rem", color: "var(--text)" }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {step.description}
                    </div>
                    {agentStep?.observation && (
                      <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace", background: "var(--surface-alt)", padding: "2px 6px", borderRadius: 3 }}>
                        {agentStep.observation.slice(0, 120)}
                      </div>
                    )}
                    {agentStep?.error && (
                      <div style={{ fontSize: "0.6rem", color: "var(--red)", marginTop: 2, fontFamily: "monospace" }}>
                        {agentStep.error.slice(0, 120)}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: "0.6rem", color: statusColor, flexShrink: 0 }}>
                    {stepStatus}
                  </span>
                </div>
              );
            })}

          </div>

          {state.plan.some(s => s.riskLevel !== "blocked") && (
            <div style={{ marginTop: 12 }}>
              {/* Risk Level */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8,
                padding: "4px 12px", borderRadius: 4,
                background: currentRiskLevel === "blocked" ? "rgba(255,0,0,0.1)" : currentRiskLevel === "high" ? "rgba(255,165,0,0.1)" : currentRiskLevel === "medium" ? "rgba(255,165,0,0.06)" : "rgba(0,255,0,0.06)",
                border: `1px solid ${currentRiskLevel === "blocked" ? "var(--red)" : currentRiskLevel === "high" || currentRiskLevel === "medium" ? "var(--amber)" : "var(--green)"}`,
                fontSize: "0.7rem",
              }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{isZh ? "风险等级:" : "Risk Level:"}</span>
                <span style={{
                  fontWeight: 700,
                  color: currentRiskLevel === "blocked" ? "var(--red)" : currentRiskLevel === "high" || currentRiskLevel === "medium" ? "var(--amber)" : "var(--green)",
                }}>
                  {currentRiskLevel === "blocked" ? (isZh ? "已阻止" : "Blocked") :
                   currentRiskLevel === "high" ? (isZh ? "高" : "High") :
                   currentRiskLevel === "medium" ? (isZh ? "中" : "Medium") : (isZh ? "低" : "Low")}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={handleDryRun} disabled={!canConfirm}
                  style={{ fontSize: "0.75rem", color: "var(--primary)", border: "1px solid var(--primary)" }}>
                  {isZh ? "干跑 (Dry Run)" : "Dry Run"}
                </button>
                <button className="btn btn-primary" onClick={handleConfirmRun} disabled={!canConfirm}
                  style={{ fontSize: "0.75rem", background: canConfirm ? "var(--green)" : undefined, borderColor: canConfirm ? "var(--green)" : undefined }}>
                  {tk("computerUse.confirmRun")} ({state.plan.length} {isZh ? "步" : "step(s)"})
                </button>
                <button className="btn btn-danger" onClick={handleStop} disabled={!canStop} style={{ fontSize: "0.75rem" }}>
                  {tk("computerUse.stop")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dry Run Results */}
      {dryRunLogs && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: "var(--surface-alt)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8, color: "var(--primary)" }}>
            {isZh ? "干跑结果 (Dry Run)" : "Dry Run Results"}
          </div>
          <div style={{
            maxHeight: 200, overflowY: "auto",
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 4, padding: 8,
            fontFamily: "monospace", fontSize: "0.7rem",
          }}>
            {dryRunLogs.map((log: ComputerUseRunLog) => (
              <div key={log.id} style={{ padding: "2px 0", color: logLevelColor(log.level) }}>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution Log */}
      {state.logs.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>
              {tk("computerUse.executionLog")}
            </div>
            <button onClick={handleClear} disabled={isBusy} className="btn btn-ghost" style={{ fontSize: "0.65rem", padding: "2px 8px" }}>
              {tk("computerUse.clearLog")}
            </button>
          </div>
          <div style={{
            maxHeight: 300, overflowY: "auto",
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 4, padding: 8,
            fontFamily: "monospace", fontSize: "0.7rem",
          }}>
            {state.logs.map((log: ComputerUseRunLog) => (
              <div key={log.id} style={{ padding: "2px 0", color: logLevelColor(log.level), display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{formatTime(log.time)}</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail */}
      <div className="card" style={{ padding: 16, background: "var(--surface-alt)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)" }}>
            {isZh ? "审计日志" : "Audit Trail"}
          </div>
          {auditLog.length > 0 && (
            <button onClick={handleClearAudit} className="btn btn-ghost" style={{ fontSize: "0.65rem", padding: "2px 8px", color: "var(--red)" }}>
              {isZh ? "清空" : "Clear"}
            </button>
          )}
        </div>
        {auditLog.length === 0 ? (
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {isZh ? "暂无审计记录" : "No audit records yet."}
          </div>
        ) : (
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {auditLog.slice(0, 20).map((entry: ComputerUseAuditEntry) => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 8px", borderRadius: 4,
                fontSize: "0.65rem", fontFamily: "monospace",
                background: entry.status === "blocked" ? "rgba(255,0,0,0.06)" : "var(--surface)",
                borderLeft: `3px solid ${entry.status === "success" ? "var(--green)" : entry.status === "blocked" ? "var(--red)" : "var(--amber)"}`,
              }}>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  {new Date(entry.createdAt).toLocaleDateString()} {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
                <span style={{ color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.task.slice(0, 40)}{entry.task.length > 40 ? "..." : ""}
                </span>
                <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", flexShrink: 0 }}>
                  {entry.steps ? entry.steps.length + " steps" : (entry.actionIds?.length || 0) + " actions"}
                </span>
                <span style={{
                  color: entry.status === "success" ? "var(--green)" : entry.status === "blocked" ? "var(--red)" : "var(--amber)",
                  fontWeight: 600, flexShrink: 0, fontSize: "0.6rem",
                }}>
                  {entry.status}{entry.permissionMode ? " \u00B7 " + (entry.permissionMode === "request_approval" ? (isZh ? "\u8BF7\u6C42\u6279\u51C6" : "approval") : entry.permissionMode === "auto_review" ? (isZh ? "\u81EA\u52A8\u5BA1\u6279" : "auto") : entry.permissionMode === "full_access" ? (isZh ? "\u5B8C\u5168\u8BBF\u95EE" : "full") : entry.permissionMode) : ""}
                </span>
                <span style={{
                  fontSize: "0.55rem", padding: "1px 4px", borderRadius: 2, flexShrink: 0,
                  background: entry.riskLevel === "blocked" ? "var(--red)" : entry.riskLevel === "high" ? "var(--amber)" : entry.riskLevel === "medium" ? "var(--amber)" : "var(--green)",
                  color: "#fff",
                }}>
                  {entry.riskLevel}
                </span>
              </div>
            ))}

          </div>
        )}
      </div>
    </div>
  );
}