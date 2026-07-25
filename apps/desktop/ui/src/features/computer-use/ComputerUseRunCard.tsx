import { useState, useCallback } from "react";
import {
  planComputerUseTask,
  getPermissionMode,
  type ComputerUseAgentStep,
  type ComputerUseAgentState,
  type AgentRunResult,
} from "../../data/computer-use";

interface ComputerUseRunCardProps {
  task: string;
  onRun: (task: string) => Promise<AgentRunResult | null>;
  onStop: () => void;
  onDeny: () => void;
  agentState?: ComputerUseAgentState;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function ComputerUseRunCard({ task, onRun, onStop, onDeny, agentState, isExpanded, onToggleExpand }: ComputerUseRunCardProps) {
  const localPlan = planComputerUseTask(task);
  const [planResult] = useState(() => localPlan);
  const initialStatus = localPlan.blocked ? "blocked" : "planning";
  const [status, setStatus] = useState<string>(initialStatus);
  const [confirmDisabled, setConfirmDisabled] = useState(false);
  const steps = planResult.plan;

  const displaySteps = agentState?.plan.length ? agentState.plan : steps;
  const displayStatus = agentState?.status || status;
  const isBlocked = displayStatus === "blocked";
  const isRunning = displayStatus === "running";
  const isDone = displayStatus === "completed" || displayStatus === "stopped" || displayStatus === "failed";

  const handleConfirm = useCallback(async () => {
    setConfirmDisabled(true);
    setStatus("running");
    try {
      await onRun(task);
      setStatus("completed");
    } catch {
      setStatus("failed");
    }
  }, [task, onRun]);

  const statusLabel = (s: string) => {
    if (s === "running") return "Running";
    if (s === "completed") return "Completed";
    if (s === "blocked") return "Blocked";
    if (s === "stopped") return "Stopped";
    if (s === "failed") return "Failed";
    return "Pending";
  };

  const stepIcon = (s: string) => {
    if (s === "success") return "\u2713";
    if (s === "failed") return "\u2717";
    if (s === "running") return "\u25B6";
    if (s === "blocked") return "\u26D4";
    if (s === "skipped") return "\u2192";
    return "\u25CB";
  };

  const stepColor = (s: string) => {
    if (s === "success") return "var(--green)";
    if (s === "failed" || s === "blocked") return "var(--red)";
    if (s === "running") return "var(--accent)";
    if (s === "skipped") return "var(--amber)";
    return "var(--text-muted)";
  };

  // Collect observation from first successful step
  const firstSuccess = displaySteps.find(s => s.status === "success" && s.observation);

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      padding: isExpanded ? 12 : "6px 12px", margin: "4px 0",
      background: isBlocked ? "rgba(255,0,0,0.04)" : isDone ? "rgba(0,128,0,0.03)" : "var(--surface-alt)",
      fontSize: "0.75rem", cursor: isDone ? "pointer" : "default",
    }} onClick={isDone ? onToggleExpand : undefined}>
      {/* Header row - always visible */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, color: "var(--text)", fontSize: isExpanded ? "0.75rem" : "0.7rem" }}>Computer Use</span>
          <span style={{
            fontSize: "0.6rem", padding: "2px 6px", borderRadius: 4,
            background: isBlocked ? "var(--red)" : isRunning ? "var(--accent)" : isDone ? "var(--green)" : "var(--amber)",
            color: "#fff",
          }}>
            {statusLabel(displayStatus)}
          </span>
          {!isExpanded && isDone && firstSuccess && (
            <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {firstSuccess.title || displaySteps[0]?.title}
            </span>
          )}
        </div>
        {isDone && (
          <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", flexShrink: 0 }}>
            {isExpanded ? "Hide details" : "Details"}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, marginBottom: 8 }}>
            {displaySteps.map((step: ComputerUseAgentStep) => {
              const s = agentState?.plan.find(ss => ss.id === step.id);
              const st = s?.status || step.status || "pending";
              return (
                <div key={step.id}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 8px", borderRadius: 4,
                    background: "var(--surface)", fontSize: "0.7rem",
                    opacity: st === "skipped" ? 0.5 : 1,
                  }}>
                    <span style={{ color: stepColor(st), flexShrink: 0, fontFamily: "monospace" }}>
                      {stepIcon(st)}
                    </span>
                    <span style={{ color: "var(--text)", flex: 1 }}>{step.title}</span>
                    {step.riskLevel && (
                      <span style={{
                        fontSize: "0.55rem", padding: "1px 4px", borderRadius: 2,
                        background: step.riskLevel === "blocked" ? "var(--red)" : step.riskLevel === "high" ? "var(--amber)" : step.riskLevel === "medium" ? "var(--amber)" : "var(--green)",
                        color: "#fff",
                      }}>
                        {step.riskLevel}
                      </span>
                    )}
                    <span style={{ fontSize: "0.6rem", color: stepColor(st) }}>{st}</span>
                  </div>
                  {/* Observation only when expanded */}
                  {step.observation && (
                    <div style={{ marginLeft: 24, marginTop: 2, marginBottom: 2, fontSize: "0.58rem", fontFamily: "monospace", color: "var(--text-muted)", background: "var(--bg)", padding: "4px 8px", borderRadius: 3, maxHeight: 80, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {step.observation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Logs */}
          {agentState?.logs && agentState.logs.length > 0 && (
            <div style={{
              maxHeight: 80, overflowY: "auto", fontSize: "0.6rem",
              background: "var(--bg)", padding: 6, borderRadius: 4, marginBottom: 8,
              fontFamily: "monospace",
            }}>
              {agentState.logs.slice(-6).map((log: any, i: number) => (
                <div key={i} style={{ color: log.level === "error" ? "var(--red)" : log.level === "success" ? "var(--green)" : "var(--text-muted)" }}>
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: isExpanded ? 0 : 4 }}>
        {!isBlocked && !isDone && !isRunning && (
          <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); handleConfirm(); }} disabled={confirmDisabled} style={{ fontSize: "0.65rem", padding: "4px 12px" }}>
            Confirm Run
          </button>
        )}
        {isRunning && (
          <button type="button" className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onStop(); }} style={{ fontSize: "0.65rem", padding: "4px 12px", color: "var(--red)" }}>
            Stop
          </button>
        )}
        {!isBlocked && !isDone && !isRunning && (
          <button type="button" className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onDeny(); }} style={{ fontSize: "0.65rem", padding: "4px 12px" }}>
            Deny
          </button>
        )}
        {isBlocked && (
          <span style={{ fontSize: "0.65rem", color: "var(--red)", fontWeight: 600 }}>
            Blocked by Enterprise Policy
          </span>
        )}
      </div>
    </div>
  );
}
