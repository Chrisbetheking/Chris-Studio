import type { ExecutionLogEntry } from "./types";
import { storeGet, storeSet } from "./safeStorage";

const STORAGE_KEY = "tokenfence.execution-log";
const MAX_ENTRIES = 1000;

let entries: ExecutionLogEntry[] = [];

function load(): void {
  try {
    const raw = storeGet(STORAGE_KEY);
    if (raw) entries = JSON.parse(raw);
  } catch { entries = []; }
}

function save(): void {
  const trimmed = entries.slice(-MAX_ENTRIES);
  try { storeSet(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* quota exceeded */ }
}

let counter = 0;
function nextId(): string { return `exec-${Date.now()}-${++counter}`; }

load();

export function addEntry(entry: Omit<ExecutionLogEntry, "id" | "timestamp">): ExecutionLogEntry {
  const full: ExecutionLogEntry = { ...entry, id: nextId(), timestamp: Date.now() };
  entries.push(full);
  save();
  return full;
}

export function getEntries(filter?: { taskId?: string; pluginId?: string; level?: string; limit?: number }): ExecutionLogEntry[] {
  let result = [...entries];
  if (filter?.taskId) result = result.filter((e) => e.taskId === filter.taskId);
  if (filter?.pluginId) result = result.filter((e) => e.pluginId === filter.pluginId);
  if (filter?.level) result = result.filter((e) => e.level === filter.level);
  result.sort((a, b) => b.timestamp - a.timestamp);
  if (filter?.limit) result = result.slice(0, filter.limit);
  return result;
}

export function clearLog(): void {
  entries = [];
  save();
}