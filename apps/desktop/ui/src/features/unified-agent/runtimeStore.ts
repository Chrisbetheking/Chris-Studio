import type {
  UnifiedAgentRun,
  UnifiedApprovalRequest,
  UnifiedRuntimeSnapshot,
  UnifiedToolEvent,
} from './types';

const STORAGE_KEY = 'chris-studio.unified-agent-runtime.v1';
const MAX_RUNS = 120;
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

function persist(): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    // Runtime receipts must never break message delivery.
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (!canStore()) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as UnifiedAgentRun[];
    const interruptedAt = new Date().toISOString();
    runs = (Array.isArray(parsed) ? parsed : [])
      .filter((entry) => entry && entry.schemaVersion === 1 && typeof entry.id === 'string')
      .map((entry) => ACTIVE.has(entry.status)
        ? {
            ...entry,
            status: 'interrupted' as const,
            updatedAt: interruptedAt,
            finishedAt: interruptedAt,
            errorMessage: 'App restarted before this task reached a durable completion receipt.',
            approvals: entry.approvals.map((approval) => approval.status === 'pending'
              ? { ...approval, status: 'denied' as const }
              : approval),
          }
        : entry)
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
