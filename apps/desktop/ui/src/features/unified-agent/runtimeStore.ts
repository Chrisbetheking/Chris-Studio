import type {
  UnifiedAgentRun,
  UnifiedApprovalRequest,
  UnifiedRuntimeSnapshot,
  UnifiedToolEvent,
} from './types';

const STORAGE_KEY = 'chris-studio.unified-agent-runtime.v1';
const MAX_RUNS = 120;
// localStorage holds roughly 5 MB per origin. Screenshot data URLs are multiple
// megabytes each, so the durable projection must stay well under that ceiling
// and degrade predictably instead of silently failing every later write.
const PERSIST_BYTE_BUDGET = 1_200_000;
const COMPACTED_RUN_LIMIT = 24;
const PERSISTED_OUTPUT_CHARS = 8_000;
const COMPACTED_OUTPUT_CHARS = 1_000;
const ACTIVE = new Set(['queued', 'planning', 'running', 'waiting-approval']);
const listeners = new Set<(snapshot: UnifiedRuntimeSnapshot) => void>();
let hydrated = false;
let runs: UnifiedAgentRun[] = [];
let activeRunIds: Record<string, string | undefined> = {};
let queueDepths: Record<string, number> = {};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canStore(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function clipOutput(output: string | undefined, limit: number): string | undefined {
  if (typeof output !== 'string') return undefined;
  if (output.length <= limit) return output;
  return `${output.slice(0, limit)}\n[truncated before persistence]`;
}

/**
 * Build the durable projection of the runtime runs.
 *
 * Screenshot bitmaps are deliberately dropped: they are large, they are session
 * evidence for one approval window, and the security model already invalidates
 * every stale capture after the next action. Keeping them here is what used to
 * push the store past the storage quota and silently disable receipt history.
 */
function persistedProjection(all: UnifiedAgentRun[], compact = false): UnifiedAgentRun[] {
  const runLimit = compact ? COMPACTED_RUN_LIMIT : MAX_RUNS;
  const outputLimit = compact ? COMPACTED_OUTPUT_CHARS : PERSISTED_OUTPUT_CHARS;
  return all.slice(0, runLimit).map((run) => ({
    ...run,
    events: (Array.isArray(run.events) ? run.events : []).map((event) => ({
      ...event,
      screenshotDataUrl: undefined,
      output: clipOutput(event.output, outputLimit),
    })),
    approvals: Array.isArray(run.approvals) ? run.approvals : [],
  }));
}

function persist(): void {
  if (!canStore()) return;
  const full = persistedProjection(runs);
  let payload = JSON.stringify(full);
  if (payload.length > PERSIST_BYTE_BUDGET) {
    payload = JSON.stringify(persistedProjection(runs, true));
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, payload);
    return;
  } catch {
    // Quota or serialization failure: retry once with the compacted projection.
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedProjection(runs, true)));
  } catch {
    // Runtime receipts must never break message delivery.
  }
}

function normalizePersistedRun(entry: UnifiedAgentRun): UnifiedAgentRun {
  const events = (Array.isArray(entry.events) ? entry.events : [])
    .filter((event) => Boolean(event))
    .map((event) => {
      // Repairs receipts written before screenshots were stripped on persist.
      if (typeof event.screenshotDataUrl === 'string' && event.screenshotDataUrl.startsWith('data:')) {
        return { ...event, screenshotDataUrl: undefined };
      }
      return event;
    });
  const approvals = Array.isArray(entry.approvals) ? entry.approvals.filter(Boolean) : [];
  const normalized: UnifiedAgentRun = { ...entry, events, approvals };
  if (!ACTIVE.has(normalized.status)) return normalized;
  const interruptedAt = new Date().toISOString();
  return {
    ...normalized,
    status: 'interrupted' as const,
    updatedAt: interruptedAt,
    finishedAt: interruptedAt,
    errorMessage: 'App restarted before this task reached a durable completion receipt.',
    approvals: approvals.map((approval) => approval.status === 'pending'
      ? { ...approval, status: 'denied' as const }
      : approval),
  };
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (!canStore()) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as UnifiedAgentRun[];
    runs = (Array.isArray(parsed) ? parsed : [])
      .filter((entry) => entry && entry.schemaVersion === 1 && typeof entry.id === 'string')
      .map(normalizePersistedRun)
      .slice(0, MAX_RUNS);
    persist();
  } catch {
    runs = [];
  }
}

function snapshot(): UnifiedRuntimeSnapshot {
  hydrate();
  return clone({ runs, activeRunIds, queueDepths });
}

function emit(): void {
  const next = snapshot();
  for (const listener of listeners) listener(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('chris-studio:unified-agent-updated', { detail: next }));
  }
}

export function loadUnifiedRuntime(): UnifiedRuntimeSnapshot {
  return snapshot();
}

export function subscribeUnifiedRuntime(listener: (snapshot: UnifiedRuntimeSnapshot) => void): () => void {
  hydrate();
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function upsertUnifiedRun(run: UnifiedAgentRun): UnifiedAgentRun {
  hydrate();
  runs = [clone(run), ...runs.filter((entry) => entry.id !== run.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RUNS);
  persist();
  emit();
  return clone(run);
}

export function updateUnifiedRun(
  id: string,
  patch: Partial<Omit<UnifiedAgentRun, 'id' | 'schemaVersion' | 'createdAt'>>,
): UnifiedAgentRun | undefined {
  hydrate();
  let updated: UnifiedAgentRun | undefined;
  runs = runs.map((entry) => {
    if (entry.id !== id) return entry;
    updated = {
      ...entry,
      ...clone(patch),
      id: entry.id,
      schemaVersion: 1,
      createdAt: entry.createdAt,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return undefined;
  persist();
  emit();
  return clone(updated);
}

export function appendToolEvent(runId: string, event: UnifiedToolEvent): UnifiedAgentRun | undefined {
  const run = runs.find((entry) => entry.id === runId);
  if (!run) return undefined;
  return updateUnifiedRun(runId, { events: [...run.events, clone(event)] });
}

export function updateToolEvent(
  runId: string,
  eventId: string,
  patch: Partial<Omit<UnifiedToolEvent, 'id' | 'call' | 'startedAt'>>,
): UnifiedAgentRun | undefined {
  const run = runs.find((entry) => entry.id === runId);
  if (!run) return undefined;
  return updateUnifiedRun(runId, {
    events: run.events.map((entry) => entry.id === eventId ? { ...entry, ...clone(patch) } : entry),
  });
}

export function appendApproval(runId: string, approval: UnifiedApprovalRequest): UnifiedAgentRun | undefined {
  const run = runs.find((entry) => entry.id === runId);
  if (!run) return undefined;
  return updateUnifiedRun(runId, { approvals: [...run.approvals, clone(approval)] });
}

export function updateApproval(
  runId: string,
  approvalId: string,
  patch: Partial<Omit<UnifiedApprovalRequest, 'id' | 'runId' | 'toolEventId' | 'createdAt'>>,
): UnifiedAgentRun | undefined {
  const run = runs.find((entry) => entry.id === runId);
  if (!run) return undefined;
  return updateUnifiedRun(runId, {
    approvals: run.approvals.map((entry) => entry.id === approvalId ? { ...entry, ...clone(patch) } : entry),
  });
}

export function setConversationRuntimeState(
  conversationId: string,
  activeRunId: string | undefined,
  queueDepth: number,
): void {
  hydrate();
  activeRunIds = { ...activeRunIds, [conversationId]: activeRunId };
  queueDepths = { ...queueDepths, [conversationId]: Math.max(0, queueDepth) };
  emit();
}

export function runsForConversation(conversationId: string): UnifiedAgentRun[] {
  return snapshot().runs.filter((run) => run.conversationId === conversationId);
}

export function resetUnifiedRuntimeForTests(): void {
  runs = [];
  activeRunIds = {};
  queueDepths = {};
  hydrated = true;
  persist();
  emit();
}
