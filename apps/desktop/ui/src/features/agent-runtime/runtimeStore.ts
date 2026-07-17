import type { ReliableRunReceipt, ReliableRunStatus } from "./reliableRun";
import type { ComputerSessionReceipt, CoordinateOverlay } from "../computer-use/sessionGuard";

export type RuntimeRunKind = "provider" | "computer" | "project" | "agent";
export type RuntimeRunStatus = ReliableRunStatus | "stopping";

export interface RuntimeRunRecord {
  schemaVersion: 1;
  id: string;
  kind: RuntimeRunKind;
  task: string;
  status: RuntimeRunStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  provider?: string;
  model?: string;
  action?: string;
  attempt?: number;
  maxAttempts?: number;
  message?: string;
  error?: string;
  reliableReceipt?: ReliableRunReceipt;
  computerReceipt?: ComputerSessionReceipt;
  coordinateOverlay?: CoordinateOverlay;
}

export interface BeginRuntimeRunInput {
  id?: string;
  kind: RuntimeRunKind;
  task: string;
  provider?: string;
  model?: string;
  action?: string;
  maxAttempts?: number;
}

const STORAGE_KEY = "chris-studio.runtime-runs.v2";
const MAX_PERSISTED_RUNS = 40;
const listeners = new Set<(runs: RuntimeRunRecord[]) => void>();
const controllers = new Map<string, AbortController>();
const ACTIVE_STATUSES = new Set<RuntimeRunStatus>([
  "idle",
  "planning",
  "running",
  "checking",
  "repairing",
  "waiting-approval",
  "stopping",
]);
let memoryRuns: RuntimeRunRecord[] = [];
let hydrated = false;

function now(): number {
  return Date.now();
}

function makeRunId(kind: RuntimeRunKind): string {
  return `${kind}-${now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isBrowserStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (!isBrowserStorageAvailable()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      const hydratedAt = now();
      memoryRuns = parsed
        .filter((entry): entry is RuntimeRunRecord => Boolean(entry && typeof entry.id === "string"))
        .map((entry) => ACTIVE_STATUSES.has(entry.status)
          ? {
              ...entry,
              status: "cancelled" as const,
              updatedAt: hydratedAt,
              finishedAt: hydratedAt,
              message: "Interrupted by app restart; the last checkpoint receipt was preserved.",
            }
          : entry)
        .slice(0, MAX_PERSISTED_RUNS);
      persist();
    }
  } catch {
    memoryRuns = [];
  }
}

function persist(): void {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRuns.slice(0, MAX_PERSISTED_RUNS)));
  } catch {
    // Runtime history must never break the main request path.
  }
}

function emit(): void {
  const snapshot = clone(memoryRuns);
  for (const listener of listeners) listener(snapshot);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chris-studio:runtime-runs-updated", { detail: snapshot }));
  }
}

function commit(next: RuntimeRunRecord[]): RuntimeRunRecord[] {
  memoryRuns = next
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PERSISTED_RUNS);
  persist();
  emit();
  return clone(memoryRuns);
}

export function loadRuntimeRuns(): RuntimeRunRecord[] {
  hydrate();
  return clone(memoryRuns);
}

export function beginRuntimeRun(input: BeginRuntimeRunInput): RuntimeRunRecord {
  hydrate();
  const timestamp = now();
  const record: RuntimeRunRecord = {
    schemaVersion: 1,
    id: input.id?.trim() || makeRunId(input.kind),
    kind: input.kind,
    task: input.task.trim() || input.action?.trim() || input.kind,
    status: "planning",
    createdAt: timestamp,
    updatedAt: timestamp,
    provider: input.provider?.trim() || undefined,
    model: input.model?.trim() || undefined,
    action: input.action?.trim() || undefined,
    attempt: 0,
    maxAttempts: Math.max(1, input.maxAttempts ?? 1),
  };
  controllers.set(record.id, new AbortController());
  commit([record, ...memoryRuns.filter((entry) => entry.id !== record.id)]);
  return clone(record);
}

export function updateRuntimeRun(
  id: string,
  patch: Partial<Omit<RuntimeRunRecord, "id" | "schemaVersion" | "createdAt">>,
): RuntimeRunRecord | undefined {
  hydrate();
  let updated: RuntimeRunRecord | undefined;
  const timestamp = now();
  const next = memoryRuns.map((entry) => {
    if (entry.id !== id) return entry;
    updated = {
      ...entry,
      ...patch,
      id: entry.id,
      schemaVersion: 1,
      createdAt: entry.createdAt,
      updatedAt: timestamp,
    };
    return updated;
  });
  if (!updated) return undefined;
  commit(next);
  return clone(updated);
}

export function publishReliableReceipt(id: string, receipt: ReliableRunReceipt): RuntimeRunRecord | undefined {
  return updateRuntimeRun(id, {
    status: receipt.status,
    attempt: receipt.repairAttempts + 1,
    maxAttempts: receipt.maxRepairAttempts + 1,
    reliableReceipt: receipt,
    message: receipt.stopReason,
    error: receipt.error,
    finishedAt: receipt.finishedAt,
  });
}

function runtimeStatusFromComputerReceipt(receipt: ComputerSessionReceipt): RuntimeRunStatus {
  switch (receipt.status) {
    case "active":
      return "running";
    case "stopped":
      return "cancelled";
    case "timed-out":
      return "timed-out";
    case "completed":
      return "completed";
    default:
      return "idle";
  }
}

export function publishComputerReceipt(
  id: string,
  receipt: ComputerSessionReceipt,
  coordinateOverlay?: CoordinateOverlay,
): RuntimeRunRecord | undefined {
  return updateRuntimeRun(id, {
    status: runtimeStatusFromComputerReceipt(receipt),
    computerReceipt: receipt,
    coordinateOverlay,
    message: receipt.stopReason,
    finishedAt: receipt.finishedAt,
  });
}

export function finishRuntimeRun(
  id: string,
  status: Extract<RuntimeRunStatus, "completed" | "failed" | "cancelled" | "timed-out">,
  message?: string,
): RuntimeRunRecord | undefined {
  const result = updateRuntimeRun(id, {
    status,
    finishedAt: now(),
    message: status === "completed" || status === "cancelled" ? message : undefined,
    error: status === "failed" || status === "timed-out" ? message : undefined,
  });
  controllers.delete(id);
  return result;
}

export function requestRuntimeStop(id: string, reason = "Stopped by user."): RuntimeRunRecord | undefined {
  const controller = controllers.get(id);
  if (controller && !controller.signal.aborted) controller.abort(reason);
  return updateRuntimeRun(id, { status: "stopping", message: reason });
}

export function getRuntimeSignal(id: string): AbortSignal | undefined {
  return controllers.get(id)?.signal;
}

export class RuntimeStopError extends Error {
  constructor(message = "Runtime run stopped by user.") {
    super(message);
    this.name = "RuntimeStopError";
  }
}

export async function raceWithRuntimeStop<T>(id: string, operation: Promise<T>): Promise<T> {
  const signal = getRuntimeSignal(id);
  if (!signal) return operation;
  if (signal.aborted) throw new RuntimeStopError(String(signal.reason || "Stopped by user."));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new RuntimeStopError(String(signal.reason || "Stopped by user.")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

export async function delayWithRuntimeStop(id: string, delayMs: number): Promise<void> {
  const delay = new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
  return raceWithRuntimeStop(id, delay);
}

export function subscribeRuntimeRuns(listener: (runs: RuntimeRunRecord[]) => void): () => void {
  hydrate();
  listeners.add(listener);
  listener(clone(memoryRuns));
  return () => {
    listeners.delete(listener);
  };
}

export function clearFinishedRuntimeRuns(): RuntimeRunRecord[] {
  hydrate();
  return commit(memoryRuns.filter((entry) => ACTIVE_STATUSES.has(entry.status)));
}

export function resetRuntimeStoreForTests(): void {
  for (const controller of controllers.values()) {
    if (!controller.signal.aborted) controller.abort("Test reset.");
  }
  controllers.clear();
  memoryRuns = [];
  hydrated = true;
  persist();
  emit();
}
