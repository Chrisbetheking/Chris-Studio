import { useEffect, useMemo, useRef, useState } from "react";
import {
  acknowledgeAllRuntimeFailures,
  acknowledgeRuntimeRun,
  archiveFinishedRuntimeRuns,
  archiveRuntimeRun,
  clearArchivedRuntimeRuns,
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

type RuntimeView = "current" | "attention" | "recent" | "archived";

interface RuntimeGroup {
  root: RuntimeRunRecord;
  children: RuntimeRunRecord[];
}

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
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return zh ? `${days} 天前` : `${days}d ago`;
}

function groupRuntimeRuns(runs: RuntimeRunRecord[]): RuntimeGroup[] {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const directChildren = new Map<string, RuntimeRunRecord[]>();
  for (const run of runs) {
    if (!run.parentId || !byId.has(run.parentId)) continue;
    directChildren.set(run.parentId, [...(directChildren.get(run.parentId) ?? []), run]);
  }

  const collect = (rootId: string): RuntimeRunRecord[] => {
    const result: RuntimeRunRecord[] = [];
    const queue = [...(directChildren.get(rootId) ?? [])];
    while (queue.length) {
      const next = queue.shift();
      if (!next) continue;
      result.push(next);
      queue.push(...(directChildren.get(next.id) ?? []));
    }
    return result.sort((a, b) => a.createdAt - b.createdAt);
  };

  return runs
    .filter((run) => !run.parentId || !byId.has(run.parentId))
    .map((root) => ({ root, children: collect(root.id) }))
    .sort((a, b) => b.root.updatedAt - a.root.updatedAt);
}

function isAttention(group: RuntimeGroup): boolean {
  return !group.root.archivedAt
    && !group.root.acknowledgedAt
    && (group.root.status === "failed" || group.root.status === "timed-out");
}

function progressFor(run: RuntimeRunRecord): number {
  const checkpoints = run.reliableReceipt?.checkpoints ?? [];
  const passed = checkpoints.filter((checkpoint) => checkpoint.status === "passed").length;
  if (checkpoints.length) return Math.round((passed / checkpoints.length) * 100);
  if (run.status === "completed") return 100;
  if (ACTIVE.has(run.status)) {
    const attempt = Math.max(1, run.attempt ?? 1);
    const maxAttempts = Math.max(attempt, run.maxAttempts ?? 1);
    return Math.min(92, Math.max(12, Math.round((attempt / maxAttempts) * 100)));
  }
  return 0;
}

function CompactChild({ run, zh }: { run: RuntimeRunRecord; zh: boolean }) {
  return (
    <div className={`reliability-child reliability-${run.status}`}>
      <span className="reliability-status-dot" aria-hidden="true" />
      <div>
        <strong>{run.task}</strong>
        <span>{statusLabel(run.status, zh)} · {relativeTime(run.updatedAt, zh)}</span>
        {(run.error || run.message) && <small>{run.error || run.message}</small>}
      </div>
    </div>
  );
}

function RunCard({ group, zh }: { group: RuntimeGroup; zh: boolean }) {
  const { root: run, children } = group;
  const active = ACTIVE.has(run.status);
  const attention = isAttention(group);
  const checkpoints = run.reliableReceipt?.checkpoints ?? [];
  const [expanded, setExpanded] = useState(active || attention);
  const completedChildren = children.filter((child) => child.status === "completed").length;
  const failedChildren = children.filter((child) => child.status === "failed" || child.status === "timed-out").length;
  const progress = progressFor(run);

  return (
    <article className={`reliability-run reliability-${run.status} ${run.archivedAt ? "is-archived" : ""}`}>
      <header>
        <div className="reliability-run-icon" aria-hidden="true">
          {run.kind === "computer" ? "⌖" : run.kind === "provider" ? "AI" : run.kind === "project" ? "<>" : "◆"}
        </div>
        <div className="reliability-run-heading">
          <strong>{run.task || (zh ? "未命名任务" : "Untitled task")}</strong>
          <span>{statusLabel(run.status, zh)} · {relativeTime(run.updatedAt, zh)}</span>
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
          <span>{zh ? "步骤" : "step"} {Math.max(1, run.attempt ?? 1)}/{run.maxAttempts}</span>
        )}
        {children.length > 0 && (
          <span>{zh ? `${completedChildren}/${children.length} 子步骤完成` : `${completedChildren}/${children.length} child steps`}</span>
        )}
        {failedChildren > 0 && <span className="reliability-meta-warning">{zh ? `${failedChildren} 个子步骤失败` : `${failedChildren} child failures`}</span>}
      </div>

      {(run.message || run.error) && (
        <p className={run.error ? "reliability-error" : "reliability-message"}>{run.error || run.message}</p>
      )}

      {checkpoints.length > 0 && (
        <div className="reliability-checkpoints">
          {checkpoints.slice(-4).map((checkpoint) => (
            <span key={checkpoint.id} className={`checkpoint-${checkpoint.status}`}>
              <i />{checkpoint.label}
            </span>
          ))}
        </div>
      )}

      {run.coordinateOverlay && (
        <div className="reliability-coordinate">
          {zh ? "批准坐标" : "Approved target"}: {run.coordinateOverlay.x}, {run.coordinateOverlay.y}
        </div>
      )}

      {children.length > 0 && (
        <div className="reliability-children">
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? (zh ? "收起子步骤" : "Hide child steps") : (zh ? `查看 ${children.length} 个子步骤` : `Show ${children.length} child steps`)}
          </button>
          {expanded && <div className="reliability-child-list">{children.map((child) => <CompactChild key={child.id} run={child} zh={zh} />)}</div>}
        </div>
      )}

      <div className="reliability-card-actions">
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
        {attention && (
          <button type="button" className="reliability-secondary" onClick={() => acknowledgeRuntimeRun(run.id)}>
            {zh ? "标记已处理" : "Mark handled"}
          </button>
        )}
        {!active && !run.archivedAt && (
          <button type="button" className="reliability-secondary" onClick={() => archiveRuntimeRun(run.id)}>
            {zh ? "归档" : "Archive"}
          </button>
        )}
      </div>
    </article>
  );
}

export function ReliabilityDock() {
  const [runs, setRuns] = useState<RuntimeRunRecord[]>(() => loadRuntimeRuns());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<RuntimeView>("current");
  const [zh, setZh] = useState(isZh());
  const [, setClockTick] = useState(0);
  const seenWaitingApproval = useRef(new Set<string>());

  useEffect(() => subscribeRuntimeRuns((next) => {
    setRuns(next);
    const newApproval = next.find((run) => run.status === "waiting-approval" && !seenWaitingApproval.current.has(run.id));
    for (const run of next) {
      if (run.status === "waiting-approval") seenWaitingApproval.current.add(run.id);
    }
    if (newApproval) {
      setView("current");
      setOpen(true);
    }
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

  const groups = useMemo(() => groupRuntimeRuns(runs), [runs]);
  const currentGroups = useMemo(() => groups.filter((group) => ACTIVE.has(group.root.status) && !group.root.archivedAt), [groups]);
  const attentionGroups = useMemo(() => groups.filter(isAttention), [groups]);
  const recentGroups = useMemo(() => groups.filter((group) => !ACTIVE.has(group.root.status) && !group.root.archivedAt && !isAttention(group)), [groups]);
  const archivedGroups = useMemo(() => groups.filter((group) => Boolean(group.root.archivedAt)), [groups]);

  const visibleGroups = view === "current" ? currentGroups
    : view === "attention" ? attentionGroups
      : view === "recent" ? recentGroups
        : archivedGroups;

  const labels: Record<RuntimeView, [string, string]> = {
    current: ["Current", "当前任务"],
    attention: ["Attention", "需要处理"],
    recent: ["Recent", "最近完成"],
    archived: ["Archived", "已归档"],
  };

  return (
    <div className={`reliability-dock ${open ? "is-open" : ""}`}>
      {open && (
        <section className="reliability-panel" aria-label={zh ? "可靠执行中心" : "Reliable runtime center"}>
          <header className="reliability-panel-header">
            <div>
              <span>CHRIS STUDIO v2.2</span>
              <h2>{zh ? "可靠执行中心" : "Reliable runtime"}</h2>
              <p>{zh ? "一个目标一张主卡片；子步骤、错误与审批收纳在任务内部。" : "One parent card per goal, with child steps, errors and approvals grouped inside."}</p>
            </div>
            <button type="button" aria-label={zh ? "关闭" : "Close"} onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="reliability-summary">
            <button type="button" className={view === "current" ? "is-active" : ""} onClick={() => setView("current")}><strong>{currentGroups.length}</strong>{zh ? "运行中" : "active"}</button>
            <button type="button" className={view === "attention" ? "is-active" : ""} onClick={() => setView("attention")}><strong>{attentionGroups.length}</strong>{zh ? "需处理" : "attention"}</button>
            <button type="button" className={view === "recent" ? "is-active" : ""} onClick={() => setView("recent")}><strong>{recentGroups.length}</strong>{zh ? "最近完成" : "recent"}</button>
          </div>

          <nav className="reliability-tabs" aria-label={zh ? "执行记录分类" : "Runtime receipt categories"}>
            {(Object.keys(labels) as RuntimeView[]).map((item) => (
              <button key={item} type="button" className={view === item ? "is-active" : ""} onClick={() => setView(item)}>
                {labels[item][zh ? 1 : 0]}
                <span>{item === "current" ? currentGroups.length : item === "attention" ? attentionGroups.length : item === "recent" ? recentGroups.length : archivedGroups.length}</span>
              </button>
            ))}
          </nav>

          <div className="reliability-list">
            {visibleGroups.length ? visibleGroups.slice(0, 16).map((group) => <RunCard key={group.root.id} group={group} zh={zh} />) : (
              <div className="reliability-empty">
                <strong>{zh ? "这个分类里没有任务" : "No tasks in this category"}</strong>
                <span>{zh ? "新的模型请求、Agent 与电脑操作会自动归入对应分类。" : "New model, Agent and Computer Use runs will be grouped automatically."}</span>
              </div>
            )}
          </div>

          <footer>
            {view === "attention" && attentionGroups.length > 0 && <button type="button" onClick={() => acknowledgeAllRuntimeFailures()}>{zh ? "全部标记已处理" : "Mark all handled"}</button>}
            {view !== "archived" && groups.some((group) => !ACTIVE.has(group.root.status) && !group.root.archivedAt) && <button type="button" onClick={() => archiveFinishedRuntimeRuns()}>{zh ? "归档全部已结束任务" : "Archive all finished"}</button>}
            {view === "archived" && archivedGroups.length > 0 && <button type="button" onClick={() => clearArchivedRuntimeRuns()}>{zh ? "清空归档" : "Clear archive"}</button>}
          </footer>
        </section>
      )}

      <button
        type="button"
        className={`reliability-launcher ${attentionGroups.length ? "has-attention" : ""}`}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) setView(currentGroups.length ? "current" : attentionGroups.length ? "attention" : "recent");
        }}
        aria-expanded={open}
        title={zh ? "可靠执行中心" : "Reliable runtime"}
      >
        <span className="reliability-launcher-mark">R</span>
        <span>{currentGroups.length ? `${currentGroups.length} ${zh ? "运行中" : "active"}` : (zh ? "可靠执行" : "Runtime")}</span>
        {attentionGroups.length > 0 && <em>{attentionGroups.length}</em>}
      </button>
    </div>
  );
}
