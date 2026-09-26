import type { ApprovalResolution, UnifiedApprovalRequest } from './types';
import { appendApproval, updateApproval, updateToolEvent, updateUnifiedRun } from './runtimeStore';

interface PendingApproval {
  runId: string;
  request: UnifiedApprovalRequest;
  resolve: (resolution: ApprovalResolution) => void;
}

const pending = new Map<string, PendingApproval>();

function makeId(): string {
  return `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function requestUnifiedApproval(
  request: Omit<UnifiedApprovalRequest, 'id' | 'createdAt' | 'status'>,
): Promise<ApprovalResolution> {
  const approval: UnifiedApprovalRequest = {
    ...request,
    id: makeId(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  appendApproval(request.runId, approval);
  updateToolEvent(request.runId, request.toolEventId, { status: 'waiting-approval' });
  updateUnifiedRun(request.runId, { status: 'waiting-approval' });
  return new Promise<ApprovalResolution>((resolve) => {
    pending.set(approval.id, { runId: request.runId, request: approval, resolve });
  });
}

export function resolveUnifiedApproval(
  approvalId: string,
  approved: boolean,
  selectedPaths?: string[],
): boolean {
  const item = pending.get(approvalId);
  if (!item) return false;
  pending.delete(approvalId);
  const resolution: ApprovalResolution = {
    approved,
    selectedPaths: selectedPaths?.slice(),
  };
  updateApproval(item.runId, approvalId, {
    status: approved ? 'approved' : 'denied',
    selectedPaths: selectedPaths?.slice(),
  });
  updateToolEvent(item.runId, item.request.toolEventId, {
    status: approved ? 'running' : 'denied',
    selectedPaths: selectedPaths?.slice(),
    finishedAt: approved ? undefined : new Date().toISOString(),
    summary: approved ? 'User approved this action.' : 'User denied this action.',
  });
  updateUnifiedRun(item.runId, { status: approved ? 'running' : 'waiting-approval' });
  item.resolve(resolution);
  return true;
}

export function denyApprovalsForRun(runId: string): void {
  for (const [approvalId, item] of pending) {
    if (item.runId !== runId) continue;
    resolveUnifiedApproval(approvalId, false);
  }
}
