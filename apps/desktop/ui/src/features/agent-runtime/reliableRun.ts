export const DEFAULT_MAX_LOOPS = 12;
export const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;
export const DEFAULT_HARD_TIMEOUT_MS = 20 * 60 * 1000;

export type ReliableRunStatus =
  | "idle"
  | "planning"
  | "running"
  | "checking"
  | "repairing"
  | "waiting-approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed-out";

export type CheckpointStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface ReliableRunCheckpoint {
  id: string;
  label: string;
  status: CheckpointStatus;
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  detail?: string;
}

export interface PatchBackupReceipt {
  path: string;
  backupPath: string;
  sha256Before?: string;
  sha256After?: string;
}

export interface ReliableRunReceipt {
  schemaVersion: 1;
  runId: string;
  task: string;
  status: ReliableRunStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  maxLoops: number;
  loopCount: number;
  maxRepairAttempts: number;
  repairAttempts: number;
  checkpoints: ReliableRunCheckpoint[];
  patchBackups: PatchBackupReceipt[];
  stopReason?: string;
  error?: string;
}

export interface ReliableRunOptions {
  task: string;
  runId?: string;
  maxLoops?: number;
  maxRepairAttempts?: number;
  hardTimeoutMs?: number;
  now?: () => number;
}

function cloneReceipt(receipt: ReliableRunReceipt): ReliableRunReceipt {
  return JSON.parse(JSON.stringify(receipt)) as ReliableRunReceipt;
}

function fallbackRunId(now: number): string {
  return `run-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ReliableRunController {
  private readonly now: () => number;
  private readonly abortController = new AbortController();
  private readonly hardTimeoutMs: number;
  private hardTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  private receipt: ReliableRunReceipt;

  constructor(options: ReliableRunOptions) {
    const now = options.now ?? Date.now;
    const startedAt = now();
    this.now = now;
    this.hardTimeoutMs = Math.max(0, options.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS);
    this.receipt = {
      schemaVersion: 1,
      runId: options.runId?.trim() || fallbackRunId(startedAt),
      task: options.task.trim(),
      status: "idle",
      startedAt,
      updatedAt: startedAt,
      maxLoops: Math.max(1, options.maxLoops ?? DEFAULT_MAX_LOOPS),
      loopCount: 0,
      maxRepairAttempts: Math.max(0, options.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS),
      repairAttempts: 0,
      checkpoints: [],
      patchBackups: [],
    };
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  start(status: Extract<ReliableRunStatus, "planning" | "running"> = "planning"): ReliableRunReceipt {
    this.assertNotFinished();
    this.receipt.status = status;
    this.touch();
    if (this.hardTimeoutMs > 0 && this.hardTimeoutHandle === undefined) {
      this.hardTimeoutHandle = setTimeout(() => {
        this.stop("timed-out", `Hard timeout reached after ${this.hardTimeoutMs}ms.`);
      }, this.hardTimeoutMs);
    }
    return this.snapshot();
  }

  beginLoop(): number {
    this.assertActive();
    if (this.receipt.loopCount >= this.receipt.maxLoops) {
      this.fail(`Maximum Agent loop count reached (${this.receipt.maxLoops}).`);
      throw new Error(this.receipt.error);
    }
    this.receipt.loopCount += 1;
    this.receipt.status = "running";
    this.touch();
    return this.receipt.loopCount;
  }

  beginCheckpoint(id: string, label: string, status: ReliableRunStatus = "checking"): ReliableRunCheckpoint {
    this.assertActive();
    const existing = this.receipt.checkpoints.find((entry) => entry.id === id);
    const checkpoint: ReliableRunCheckpoint = existing ?? {
      id,
      label,
      status: "pending",
      attempt: 0,
    };
    checkpoint.label = label;
    checkpoint.status = "running";
    checkpoint.attempt += 1;
    checkpoint.startedAt = this.now();
    checkpoint.finishedAt = undefined;
    checkpoint.detail = undefined;
    if (!existing) this.receipt.checkpoints.push(checkpoint);
    this.receipt.status = status;
    this.touch();
    return { ...checkpoint };
  }

  finishCheckpoint(id: string, passed: boolean, detail?: string): ReliableRunCheckpoint {
    this.assertActive();
    const checkpoint = this.receipt.checkpoints.find((entry) => entry.id === id);
    if (!checkpoint) throw new Error(`Unknown checkpoint: ${id}`);
    checkpoint.status = passed ? "passed" : "failed";
    checkpoint.finishedAt = this.now();
    checkpoint.detail = detail;
    this.receipt.status = passed ? "running" : "checking";
    if (!passed) this.receipt.error = detail || `Checkpoint failed: ${checkpoint.label}`;
    this.touch();
    return { ...checkpoint };
  }

  beginRepair(error: string): boolean {
    this.assertActive();
    if (this.receipt.repairAttempts >= this.receipt.maxRepairAttempts) {
      this.fail(`Automatic repair limit reached (${this.receipt.maxRepairAttempts}). Last error: ${error}`);
      return false;
    }
    this.receipt.repairAttempts += 1;
    this.receipt.status = "repairing";
    this.receipt.error = error;
    this.touch();
    return true;
  }

  waitForApproval(reason?: string): ReliableRunReceipt {
    this.assertActive();
    this.receipt.status = "waiting-approval";
    this.receipt.stopReason = reason;
    this.touch();
    return this.snapshot();
  }

  resume(): ReliableRunReceipt {
    this.assertNotFinished();
    if (this.receipt.status !== "waiting-approval") {
      throw new Error(`Cannot resume a run in ${this.receipt.status} state.`);
    }
    this.receipt.status = "running";
    this.receipt.stopReason = undefined;
    this.touch();
    return this.snapshot();
  }

  recordPatchBackup(backup: PatchBackupReceipt): void {
    this.assertActive();
    const normalized = {
      ...backup,
      path: backup.path.trim(),
      backupPath: backup.backupPath.trim(),
    };
    if (!normalized.path || !normalized.backupPath) {
      throw new Error("Patch backup receipts require path and backupPath.");
    }
    this.receipt.patchBackups.push(normalized);
    this.touch();
  }

  complete(): ReliableRunReceipt {
    this.assertActive();
    this.receipt.status = "completed";
    this.receipt.error = undefined;
    this.finish();
    return this.snapshot();
  }

  fail(error: string): ReliableRunReceipt {
    if (this.isFinished()) return this.snapshot();
    this.receipt.status = "failed";
    this.receipt.error = error;
    this.finish();
    return this.snapshot();
  }

  cancel(reason = "Stopped by user."): ReliableRunReceipt {
    return this.stop("cancelled", reason);
  }

  snapshot(): ReliableRunReceipt {
    return cloneReceipt(this.receipt);
  }

  private stop(status: Extract<ReliableRunStatus, "cancelled" | "timed-out">, reason: string): ReliableRunReceipt {
    if (this.isFinished()) return this.snapshot();
    this.receipt.status = status;
    this.receipt.stopReason = reason;
    this.abortController.abort(reason);
    this.finish();
    return this.snapshot();
  }

  private assertActive(): void {
    this.assertNotFinished();
    if (this.receipt.status === "idle") throw new Error("Run has not started.");
    if (this.receipt.status === "waiting-approval") throw new Error("Run is waiting for explicit approval.");
    if (this.signal.aborted) throw new Error(String(this.signal.reason || "Run aborted."));
  }

  private assertNotFinished(): void {
    if (this.isFinished()) throw new Error(`Run already finished with status ${this.receipt.status}.`);
  }

  private isFinished(): boolean {
    return ["completed", "failed", "cancelled", "timed-out"].includes(this.receipt.status);
  }

  private touch(): void {
    this.receipt.updatedAt = this.now();
  }

  private finish(): void {
    const now = this.now();
    this.receipt.updatedAt = now;
    this.receipt.finishedAt = now;
    if (this.hardTimeoutHandle !== undefined) {
      clearTimeout(this.hardTimeoutHandle);
      this.hardTimeoutHandle = undefined;
    }
  }
}
