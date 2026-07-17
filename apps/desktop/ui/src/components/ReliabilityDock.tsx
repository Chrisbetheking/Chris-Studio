import { useEffect, useMemo, useState } from "react";
import {
  clearFinishedRuntimeRuns,
  loadRuntimeRuns,
  requestRuntimeStop,
  subscribeRuntimeRuns,
  type RuntimeRunRecord,
  type RuntimeRunStatus,
} from "../features/agent-runtime/runtimeStore";
import "../styles/reliability-dock.css";

const ACTIVE = new Set<RuntimeRunStatus>([
  "idle",
  "planning",
  "running",
  "checking",
  "repairing",
  "waiting-approval",
  "stopping",
]);

function isZh(): boolean {
  return typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
}

function statusLabel(status: RuntimeRunStatus, zh: boolean): string {
  const labels: Record<RuntimeRunStatus, [string, string]> = {
    idle: ["Idle", "待命"],
    planning: ["Planning", "规划中"],
    running: ["Running", "执行中"],
    checking: ["Checking", "检查中"],
    repairing: ["Auto repair", "自动修复"],
    "waiting-approval": ["Approval required", "等待批准"],
    completed: ["Completed", "已完成"],
    failed: ["Failed", "失败"],
    cancelled: ["Stopped", "已停止"],
    "timed-out": ["Timed out", "已超时"],
    stopping: ["Stopping", "正在停止"],
  };
  return labels[status]?.[zh ? 1 : 0] ?? status;
}

function relativeTime(timestamp: number, zh: boolean): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return zh ? `${seconds} 秒前` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return zh ? `${hours} 小时前` : `${hours}h ago`;
}

function RunCard({ run, zh }: { run: RuntimeRunRecord; zh: boolean }) {
  const active = ACTIVE.has(run.status);
  const receipt = run.reliableReceipt;
  const checkpoints = receipt?.checkpoints ?? [];
  const passed = checkpoints.filter((checkpoint) => checkpoint.status === "passed").length;
  const progress = checkpoints.length
    ? Math.round((passed / checkpoints.length) * 100)
    : run.status === "completed"
      ? 100
      : active
        ? 38
        : 0;

  return (
    <article className={`reliability-run reliability-${run.status}`}>
      <header>
        <div className="reliability-run-icon" aria-hidden="true">
          {run.kind === "computer" ? "⌖" : run.kind === "provider" ? "AI" : "◆"}
        </div>
        <div className="reliability-run-heading">
          <strong>{run.task || (zh ? "未命名任务" : "Untitled task")}</strong>
          <span>
            {statusLabel(run.status, zh)} · {relativeTime(run.updatedAt, zh)}
          </span>
        </div>
        <span className="reliability-status-dot" title={statusLabel(run.status, zh)} />
      </header>

      <div className="reliability-progress" aria-label={`${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="reliability-meta">
        {run.provider && <span>{run.provider}</span>}
        {run.model && <span>{run.model}</span>}
        {run.action && <span>{run.action}</span>}
        {run.maxAttempts && run.maxAttempts > 1 && (
          <span>
            {zh ? "尝试" : "attempt"} {Math.max(1, run.attempt ?? 1)}/{run.maxAttempts}
          </span>
        )}
      </div>

      {(run.message || run.error) && (
        <p className={run.error ? "reliability-error" : "reliability-message"}>
          {run.error || run.message}
        </p>
      )}

      {checkpoints.length > 0 && (
        <div className="reliability-checkpoints">
          {checkpoints.slice(-4).map((checkpoint) => (
            <span key={checkpoint.id} className={`checkpoint-${checkpoint.status}`}>
              <i />
              {checkpoint.label}
            </span>
          ))}
        </div>
      )}

      {run.coordinateOverlay && (
        <div className="reliability-coordinate">
          {zh ? "批准坐标" : "Approved target"}: {run.coordinateOverlay.x}, {run.coordinateOverlay.y}
        </div>
      )}

      {active && (
        <button
          type="button"
          className="reliability-stop"
          onClick={() => requestRuntimeStop(run.id, zh ? "用户点击紧急停止。" : "Emergency stop requested by user.")}
          disabled={run.status === "stopping"}
        >
          {run.status === "stopping" ? (zh ? "正在停止" : "Stopping") : (zh ? "紧急停止" : "Emergency stop")}
        </button>
      )}
    </article>
  );
}

export function ReliabilityDock() {
  const [runs, setRuns] = useState<RuntimeRunRecord[]>(() => loadRuntimeRuns());
  const [open, setOpen] = useState(false);
  const [zh, setZh] = useState(isZh());
  const [, setClockTick] = useState(0);

  useEffect(() => subscribeRuntimeRuns((next) => {
    setRuns(next);
    if (next.some((run) => run.status === "failed" || run.status === "waiting-approval")) setOpen(true);
  }), []);

  useEffect(() => {
    const updateLanguage = () => setZh(isZh());
    const observer = new MutationObserver(updateLanguage);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    window.addEventListener("tokenfence:settings-updated", updateLanguage);
    updateLanguage();
    return () => {
      observer.disconnect();
      window.removeEventListener("tokenfence:settings-updated", updateLanguage);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeRuns = useMemo(() => runs.filter((run) => ACTIVE.has(run.status)), [runs]);
  const failedRuns = useMemo(() => runs.filter((run) => run.status === "failed" || run.status === "timed-out"), [runs]);
  const visibleRuns = useMemo(() => runs.slice(0, 12), [runs]);

  return (
    <div className={`reliability-dock ${open ? "is-open" : ""}`}>
      {open && (
        <section className="reliability-panel" aria-label={zh ? "可靠执行中心" : "Reliable runtime center"}>
          <header className="reliability-panel-header">
            <div>
              <span>CHRIS STUDIO v2.2</span>
              <h2>{zh ? "可靠执行中心" : "Reliable runtime"}</h2>
              <p>{zh ? "重试、检查点、错误分类、回滚记录与紧急停止" : "Retries, checkpoints, normalized errors, receipts and emergency stop"}</p>
            </div>
            <button type="button" aria-label={zh ? "关闭" : "Close"} onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="reliability-summary">
            <span><strong>{activeRuns.length}</strong>{zh ? "运行中" : "active"}</span>
            <span><strong>{failedRuns.length}</strong>{zh ? "需处理" : "attention"}</span>
            <span><strong>{runs.length}</strong>{zh ? "执行记录" : "receipts"}</span>
          </div>

          <div className="reliability-list">
            {visibleRuns.length ? visibleRuns.map((run) => <RunCard key={run.id} run={run} zh={zh} />) : (
              <div className="reliability-empty">
                <strong>{zh ? "当前没有执行任务" : "No runtime tasks yet"}</strong>
                <span>{zh ? "发送模型请求或运行电脑操作后，这里会显示完整状态。" : "Model requests and approved computer actions will appear here."}</span>
              </div>
            )}
          </div>

          {runs.some((run) => !ACTIVE.has(run.status)) && (
            <footer>
              <button type="button" onClick={() => clearFinishedRuntimeRuns()}>
                {zh ? "清理已结束记录" : "Clear finished receipts"}
              </button>
            </footer>
          )}
        </section>
      )}

      <button
        type="button"
        className={`reliability-launcher ${failedRuns.length ? "has-attention" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={zh ? "可靠执行中心" : "Reliable runtime"}
      >
        <span className="reliability-launcher-mark">R</span>
        <span>{activeRuns.length ? `${activeRuns.length} ${zh ? "运行中" : "active"}` : (zh ? "可靠执行" : "Runtime")}</span>
        {failedRuns.length > 0 && <em>{failedRuns.length}</em>}
      </button>
    </div>
  );
}
