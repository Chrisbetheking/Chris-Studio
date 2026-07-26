import type { AttachmentDraft, ProjectPatchFileSummary, ProviderProfile, WorkspaceMode } from '../../app/types';
import type { PrivacyAssessment } from '../privacy/contentClassifier';

export type UnifiedToolName =
  | 'project.scan'
  | 'project.search'
  | 'project.read'
  | 'project.git_status'
  | 'project.git_diff'
  | 'project.propose_patch'
  | 'project.run_check'
  | 'privacy.classify'
  | 'models.list'
  | 'models.compare'
  | 'computer.inspect'
  | 'computer.activate'
  | 'computer.capture'
  | 'computer.open'
  | 'computer.type'
  | 'computer.key'
  | 'computer.click';

export type UnifiedRunStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type UnifiedToolEventStatus =
  | 'proposed'
  | 'waiting-approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'denied';

export interface UnifiedToolCall {
  id: string;
  name: UnifiedToolName;
  args: Record<string, unknown>;
  reason: string;
}

export interface UnifiedToolEvent {
  id: string;
  call: UnifiedToolCall;
  status: UnifiedToolEventStatus;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  output?: string;
  screenshotDataUrl?: string;
  patchFiles?: ProjectPatchFileSummary[];
  selectedPaths?: string[];
  sessionId?: string;
  transactionStatus?: 'applied' | 'accepted' | 'rolled-back' | 'rollback-blocked' | 'failed';
  transactionMessage?: string;
  errorMessage?: string;
}

export interface UnifiedApprovalRequest {
  id: string;
  runId: string;
  toolEventId: string;
  toolName: UnifiedToolName;
  title: string;
  detail: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'denied';
  patchFiles?: ProjectPatchFileSummary[];
  selectedPaths?: string[];
}

export interface UnifiedAgentRun {
  schemaVersion: 1;
  id: string;
  conversationId: string;
  clientRequestId: string;
  mode: WorkspaceMode;
  goal: string;
  providerProfileId: string;
  providerName: string;
  model: string;
  projectRoot?: string;
  privacy?: PrivacyAssessment;
  status: UnifiedRunStatus;
  loop: number;
  maxLoops: number;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  queuePosition?: number;
  assistantDraft?: string;
  finalMessageId?: string;
  errorMessage?: string;
  events: UnifiedToolEvent[];
  approvals: UnifiedApprovalRequest[];
}

export interface UnifiedRuntimeSnapshot {
  runs: UnifiedAgentRun[];
  activeRunIds: Record<string, string | undefined>;
  queueDepths: Record<string, number>;
}

export interface UnifiedAgentEnqueueInput {
  conversationId: string;
  clientRequestId: string;
  goal: string;
  mode: WorkspaceMode;
  provider: ProviderProfile;
  requestTimeoutMs: number;
  attachments?: AttachmentDraft[];
  privacy?: PrivacyAssessment;
}


export interface UnifiedAgentDecisionFinal {
  type: 'final';
  content: string;
}

export interface UnifiedAgentDecisionTools {
  type: 'tool_calls';
  calls: UnifiedToolCall[];
}

export type UnifiedAgentDecision = UnifiedAgentDecisionFinal | UnifiedAgentDecisionTools;

export interface UnifiedToolObservation {
  callId: string;
  name: UnifiedToolName;
  ok: boolean;
  summary: string;
  output?: string;
  screenshotDataUrl?: string;
  sessionId?: string;
}

export interface ApprovalResolution {
  approved: boolean;
  selectedPaths?: string[];
}
