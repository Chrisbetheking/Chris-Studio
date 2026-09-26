import type { ExecutionLogEntry } from "./types";
import { storeGet, storeSet } from "./safeStorage";

const STORAGE_KEY = "tokenfence.execution-log";
const MAX_ENTRIES = 1000;

const LEVELS: ReadonlySet<string> = new Set(["info", "warn", "error", "debug"]);

let entries: ExecutionLogEntry[] = [];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Validate one persisted log entry.
 *
 * The log is read back from storage, so it must be treated as untrusted: a
 * `null` element crashed `getEntries` on `entry.timestamp` while sorting, and a
 * row without an id or a level reached the log view.
 */
function normalizeEntry(entry: unknown): ExecutionLogEntry | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const row = entry as Record<string, unknown>;
  const id = text(row.id);
  const level = text(row.level);
  if (!id || !LEVELS.has(level)) return undefined;
  const timestamp = typeof row.timestamp === "number" ? row.timestamp : Number.NaN;
  const metadata = row.metadata;
  return {
    id,
    taskId: text(row.taskId),
    stepId: text(row.stepId) || undefined,
    pluginId: text(row.pluginId),
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    level: level as ExecutionLogEntry["level"],
    message: text(row.message),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : undefined,
  };
}

/**
 * Load the persisted log into memory.
 *
 * A damaged slot used to be assigned directly to `entries`, which produced two
 * different failures: a non-iterable value made `getEntries` throw
 * (`entries is not iterable`) and every later `addEntry` throw
 * (`entries.push is not a function`) so the log stopped recording entirely; and
 * a bare JSON string was spread into its individual characters, turning the log
 * into a list of single-letter rows.
 */
function load(): void {
  try {
    const raw = storeGet(STORAGE_KEY);
    if (!raw) {
      entries = [];
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      entries = [];
      return;
    }
    entries = parsed
      .map(normalizeEntry)
      .filter((entry): entry is ExecutionLogEntry => Boolean(entry))
      .slice(-MAX_ENTRIES);
  } catch {
    entries = [];
  }
}

function save(): void {
  const trimmed = entries.slice(-MAX_ENTRIES);
  try { storeSet(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* quota exceeded */ }
}

let counter = 0;
function nextId(): string { return `exec-${Date.now()}-${++counter}`; }

load();

export function addEntry(entry: Omit<ExecutionLogEntry, "id" | "timestamp">): ExecutionLogEntry {
  // `load()` guarantees an array, but a concurrent writer could still leave the
  // in-memory list unusable, so the append is defended once more.
  if (!Array.isArray(entries)) entries = [];
  const full: ExecutionLogEntry = { ...entry, id: nextId(), timestamp: Date.now() };
  entries.push(full);
  save();
  return full;
}

export function getEntries(filter?: { taskId?: string; pluginId?: string; level?: string; limit?: number }): ExecutionLogEntry[] {
  if (!Array.isArray(entries)) entries = [];
  let result = [...entries];
  if (filter?.taskId) result = result.filter((e) => e?.taskId === filter.taskId);
  if (filter?.pluginId) result = result.filter((e) => e?.pluginId === filter.pluginId);
  if (filter?.level) result = result.filter((e) => e?.level === filter.level);
  result.sort((a, b) => (b?.timestamp ?? 0) - (a?.timestamp ?? 0));
  const limit = Number(filter?.limit);
  if (Number.isFinite(limit) && limit > 0) result = result.slice(0, Math.floor(limit));
  return result;
}

export function clearLog(): void {
  entries = [];
  save();
}