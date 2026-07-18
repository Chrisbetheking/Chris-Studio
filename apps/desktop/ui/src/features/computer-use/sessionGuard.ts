export type ComputerActionKind = "screenshot" | "open" | "click" | "type" | "key" | "scroll" | "drag";
export type ComputerSessionStatus = "idle" | "active" | "stopped" | "timed-out" | "completed";

export interface ScreenBounds {
  width: number;
  height: number;
  scaleFactor?: number;
}

export interface CoordinateOverlay {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
  radius: number;
  label: string;
}

export interface ApprovalTicket {
  id: string;
  action: ComputerActionKind;
  summary: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt?: number;
}

export interface ComputerSessionReceipt {
  schemaVersion: 1;
  sessionId: string;
  status: ComputerSessionStatus;
  startedAt?: number;
  updatedAt: number;
  finishedAt?: number;
  deadlineAt?: number;
  stopReason?: string;
  approvalsIssued: number;
  approvalsConsumed: number;
}

export interface ComputerSessionOptions {
  sessionId?: string;
  hardTimeoutMs?: number;
  approvalTtlMs?: number;
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_APPROVAL_TTL_MS = 30 * 1000;

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number.`);
  return value;
}

function sessionId(now: number): string {
  return `computer-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCoordinateOverlay(
  x: number,
  y: number,
  bounds: ScreenBounds,
  label = "Approved click target",
): CoordinateOverlay {
  const width = positiveFinite(bounds.width, "Screen width");
  const height = positiveFinite(bounds.height, "Screen height");
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Coordinates must be finite numbers.");
  if (x < 0 || y < 0 || x > width || y > height) {
    throw new Error(`Coordinates (${x}, ${y}) are outside ${width}×${height}.`);
  }
  return {
    x,
    y,
    normalizedX: Number((x / width).toFixed(6)),
    normalizedY: Number((y / height).toFixed(6)),
    radius: Math.max(8, Math.round(Math.min(width, height) * 0.012)),
    label,
  };
}

export class ComputerUseSessionGuard {
  private readonly now: () => number;
  private readonly hardTimeoutMs: number;
  private readonly approvalTtlMs: number;
  private readonly controller = new AbortController();
  private readonly tickets = new Map<string, ApprovalTicket>();
  private receipt: ComputerSessionReceipt;
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  constructor(options: ComputerSessionOptions = {}) {
    this.now = options.now ?? Date.now;
    const createdAt = this.now();
    this.hardTimeoutMs = Math.max(0, options.hardTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.approvalTtlMs = Math.max(1000, options.approvalTtlMs ?? DEFAULT_APPROVAL_TTL_MS);
    this.receipt = {
      schemaVersion: 1,
      sessionId: options.sessionId?.trim() || sessionId(createdAt),
      status: "idle",
      updatedAt: createdAt,
      approvalsIssued: 0,
      approvalsConsumed: 0,
    };
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  start(): ComputerSessionReceipt {
    if (this.receipt.status !== "idle") throw new Error(`Cannot start session in ${this.receipt.status} state.`);
    const now = this.now();
    this.receipt.status = "active";
    this.receipt.startedAt = now;
    this.receipt.updatedAt = now;
    if (this.hardTimeoutMs > 0) {
      this.receipt.deadlineAt = now + this.hardTimeoutMs;
      this.timeoutHandle = setTimeout(() => this.expire("Computer Use hard timeout reached."), this.hardTimeoutMs);
    }
    return this.snapshot();
  }

  issueApproval(action: ComputerActionKind, summary: string): ApprovalTicket {
    this.assertActive();
    const now = this.now();
    const ticket: ApprovalTicket = {
      id: `approval-${now}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      summary: summary.trim() || action,
      issuedAt: now,
      expiresAt: now + this.approvalTtlMs,
    };
    this.tickets.set(ticket.id, ticket);
    this.receipt.approvalsIssued += 1;
    this.receipt.updatedAt = now;
    return { ...ticket };
  }

  consumeApproval(ticketId: string, action: ComputerActionKind): ApprovalTicket {
    this.assertActive();
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error("Approval ticket was not found.");
    if (ticket.consumedAt !== undefined) throw new Error("Approval ticket has already been used.");
    if (ticket.action !== action) throw new Error(`Approval ticket is for ${ticket.action}, not ${action}.`);
    const now = this.now();
    if (now > ticket.expiresAt) throw new Error("Approval ticket expired before execution.");
    ticket.consumedAt = now;
    this.receipt.approvalsConsumed += 1;
    this.receipt.updatedAt = now;
    return { ...ticket };
  }

  checkDeadline(): void {
    this.assertActive();
    if (this.receipt.deadlineAt !== undefined && this.now() >= this.receipt.deadlineAt) {
      this.expire("Computer Use hard timeout reached.");
      throw new Error("Computer Use hard timeout reached.");
    }
  }

  emergencyStop(reason = "Emergency stop requested by user."): ComputerSessionReceipt {
    if (this.isFinished()) return this.snapshot();
    this.receipt.status = "stopped";
    this.receipt.stopReason = reason;
    this.controller.abort(reason);
    this.finish();
    return this.snapshot();
  }

  complete(): ComputerSessionReceipt {
    this.assertActive();
    this.receipt.status = "completed";
    this.finish();
    return this.snapshot();
  }

  snapshot(): ComputerSessionReceipt {
    return JSON.parse(JSON.stringify(this.receipt)) as ComputerSessionReceipt;
  }

  private expire(reason: string): void {
    if (this.isFinished()) return;
    this.receipt.status = "timed-out";
    this.receipt.stopReason = reason;
    this.controller.abort(reason);
    this.finish();
  }

  private assertActive(): void {
    if (this.receipt.status !== "active") throw new Error(`Computer Use session is ${this.receipt.status}.`);
    if (this.signal.aborted) throw new Error(String(this.signal.reason || "Computer Use session aborted."));
  }

  private isFinished(): boolean {
    return ["stopped", "timed-out", "completed"].includes(this.receipt.status);
  }

  private finish(): void {
    const now = this.now();
    this.receipt.updatedAt = now;
    this.receipt.finishedAt = now;
    if (this.timeoutHandle !== undefined) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }
}
