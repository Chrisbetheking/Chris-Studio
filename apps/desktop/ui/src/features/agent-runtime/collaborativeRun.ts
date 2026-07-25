import type {
  AgentPlanStep,
  AgentProfile,
  AgentResumeAttempt,
  AgentResumeStage,
  AgentRole,
  AgentRoleReceipt,
  AgentRunPhase,
  AgentRunReceipt,
  AttachmentDraft,
  ChatMessage,
  ProviderProfile,
} from '../../app/types';
import { providerDefinition } from '../../app/providerRegistry';
import { makeId, nowIso } from '../../app/store';
import {
  sendProviderChat,
  sendProviderChatStream,
} from '../providers/providerClientReliable';
import type { ProviderReply } from '../providers/providerClient';
import {
  beginRuntimeRun,
  finishRuntimeRun,
  getRuntimeSignal,
  requestRuntimeStop,
  updateRuntimeRun,
} from './runtimeStore';

export interface AgentRoleProfiles {
  planner: ProviderProfile;
  executor: ProviderProfile;
  reviewer: ProviderProfile;
}

export interface AgentCollaborationCallbacks {
  onReceipt?: (receipt: AgentRunReceipt) => void;
  onExecutorDelta: (delta: string) => void;
  onExecutorReasoning?: (delta: string) => void;
  onResetExecutor?: () => void;
}

export interface AgentProviderTransport {
  send: typeof sendProviderChat;
  stream: typeof sendProviderChatStream;
}

export interface CollaborativeAgentInput {
  agent: AgentProfile;
  profiles: ProviderProfile[];
  defaultProfile: ProviderProfile;
  messages: Pick<ChatMessage, 'role' | 'content'>[];
  timeoutMs: number;
  attachments: AttachmentDraft[];
  includeVisionImages: boolean;
  callbacks: AgentCollaborationCallbacks;
  signal?: AbortSignal;
  transport?: AgentProviderTransport;
}

export interface CollaborativeAgentResult {
  ok: boolean;
  content: string;
  receipt: AgentRunReceipt;
  executorProfile: ProviderProfile;
  errorMessage?: string;
}

export interface ResumeCollaborativeAgentInput extends CollaborativeAgentInput {
  previousReceipt: AgentRunReceipt;
  existingDraft: string;
}

interface ParsedReview {
  verdict: 'pass' | 'revise';
  summary: string;
  issues: string[];
}

function cloneReceipt(receipt: AgentRunReceipt): AgentRunReceipt {
  return JSON.parse(JSON.stringify(receipt)) as AgentRunReceipt;
}

function emit(callbacks: AgentCollaborationCallbacks, receipt: AgentRunReceipt): void {
  callbacks.onReceipt?.(cloneReceipt(receipt));
}

function profileByConfiguredId(
  role: AgentRole,
  configuredId: string | undefined,
  profiles: ProviderProfile[],
  fallback: ProviderProfile,
): ProviderProfile {
  if (!configuredId) return fallback;
  const profile = profiles.find((entry) => entry.id === configuredId && entry.enabled);
  if (!profile) {
    throw new Error(`${role} provider profile ${configuredId} is missing or disabled. Chris Studio will not silently route this role elsewhere.`);
  }
  return profile;
}

export function resolveAgentRoleProfiles(
  agent: AgentProfile,
  profiles: ProviderProfile[],
  defaultProfile: ProviderProfile,
): AgentRoleProfiles {
  const executorConfigured = agent.executorProviderProfileId || agent.providerProfileId;
  const executor = profileByConfiguredId('executor', executorConfigured, profiles, defaultProfile);
  return {
    planner: profileByConfiguredId('planner', agent.plannerProviderProfileId, profiles, executor),
    executor,
    reviewer: profileByConfiguredId('reviewer', agent.reviewerProviderProfileId, profiles, executor),
  };
}

function ensureProfileReady(role: AgentRole, profile: ProviderProfile): void {
  const definition = providerDefinition(profile.providerId);
  if (!profile.enabled) throw new Error(`${role} provider ${profile.displayName} is disabled.`);
  if (definition.requiresCredential && !profile.credentialStored && !profile.apiKey.trim()) {
    throw new Error(`${role} provider ${profile.displayName} has no stored credential.`);
  }
  if (!profile.model.trim()) throw new Error(`${role} provider ${profile.displayName} has no model configured.`);
}

function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function stepFromUnknown(value: unknown, index: number): AgentPlanStep | undefined {
  if (typeof value === 'string' && value.trim()) {
    return { id: `step-${index + 1}`, title: value.trim().slice(0, 180), status: 'pending' };
  }
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const title = String(row.title ?? row.name ?? row.step ?? '').trim();
  if (!title) return undefined;
  const detail = String(row.detail ?? row.description ?? row.reason ?? '').trim();
  return {
    id: `step-${index + 1}`,
    title: title.slice(0, 180),
    detail: detail ? detail.slice(0, 600) : undefined,
    status: 'pending',
  };
}

export function parseAgentPlan(value: string): AgentPlanStep[] {
  const parsed = extractJsonObject(value) as { steps?: unknown } | undefined;
  const structured = Array.isArray(parsed?.steps)
    ? parsed.steps.map(stepFromUnknown).filter((step): step is AgentPlanStep => Boolean(step)).slice(0, 6)
    : [];
  if (structured.length) return structured;

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim())
    .filter((line) => line.length >= 4 && line.length <= 220)
    .slice(0, 6);
  if (lines.length) return lines.map((title, index) => ({ id: `step-${index + 1}`, title, status: 'pending' }));

  return [{
    id: 'step-1',
    title: 'Execute the reviewed user outcome',
    detail: value.trim().slice(0, 600) || 'The planner returned no readable plan details.',
    status: 'pending',
  }];
}

export function parseAgentReview(value: string): ParsedReview {
  const parsed = extractJsonObject(value) as Record<string, unknown> | undefined;
  const verdictValue = String(parsed?.verdict ?? parsed?.status ?? '').toLowerCase();
  const verdict: ParsedReview['verdict'] = verdictValue.includes('revise') || verdictValue.includes('change')
    ? 'revise'
    : 'pass';
  const summary = String(parsed?.summary ?? parsed?.reason ?? parsed?.feedback ?? '').trim();
  const issues = Array.isArray(parsed?.issues)
    ? parsed.issues.map((issue) => String(issue).trim()).filter(Boolean).slice(0, 8)
    : [];
  if (parsed && (summary || issues.length || verdictValue)) {
    return { verdict, summary: summary || (verdict === 'pass' ? 'Review passed.' : 'Revision requested.'), issues };
  }

  const revise = /\b(revise|needs? changes?|not ready|fail(?:ed)?)\b|需要修改|建议修改|不通过|修订/i.test(value);
  return {
    verdict: revise ? 'revise' : 'pass',
    summary: value.trim().slice(0, 1_200) || (revise ? 'Revision requested.' : 'Review passed.'),
    issues: [],
  };
}

function roleReceipt(role: AgentRole, profile: ProviderProfile): AgentRoleReceipt {
  return {
    role,
    providerProfileId: profile.id,
    provider: profile.displayName,
    model: profile.model,
    status: 'pending',
  };
}

function updateRole(
  receipt: AgentRunReceipt,
  role: AgentRole,
  patch: Partial<AgentRoleReceipt>,
): void {
  receipt.roles = receipt.roles.map((entry) => entry.role === role ? { ...entry, ...patch } : entry);
}

function setPhase(
  receipt: AgentRunReceipt,
  phase: AgentRunPhase,
  callbacks: AgentCollaborationCallbacks,
): void {
  receipt.phase = phase;
  emit(callbacks, receipt);
}

function lastUserText(messages: Pick<ChatMessage, 'role' | 'content'>[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return 'Complete the protected workspace task.';
}

function planText(plan: AgentPlanStep[]): string {
  return plan.map((step, index) => `${index + 1}. ${step.title}${step.detail ? ` — ${step.detail}` : ''}`).join('\n');
}

function plannerMessages(
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  agent: AgentProfile,
): Pick<ChatMessage, 'role' | 'content'>[] {
  return [
    {
      role: 'system',
      content: `You are the planning role inside Chris Studio for the agent "${agent.name}". Produce a minimal, auditable plan before execution. Do not perform the task and do not claim actions occurred. Return JSON only using this shape: {"summary":"one sentence","steps":[{"title":"short step","detail":"evidence or check"}],"successCriteria":["criterion"],"risks":["risk"]}. Use 2-6 steps. Preserve approval boundaries for files, commands, GitHub, MCP and Computer Use.`,
    },
    ...messages,
  ];
}

function executorMessages(
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  agent: AgentProfile,
  plan: AgentPlanStep[],
  revisionFeedback?: ParsedReview,
): Pick<ChatMessage, 'role' | 'content'>[] {
  const revision = revisionFeedback
    ? `\nA reviewer requested one bounded revision. Address this feedback without inventing completed native actions:\n${revisionFeedback.summary}\n${revisionFeedback.issues.map((issue) => `- ${issue}`).join('\n')}`
    : '';
  return [
    {
      role: 'system',
      content: `You are the execution role inside Chris Studio for the agent "${agent.name}". Follow the reviewed plan below and produce the user-facing result. Never claim that a file write, command, push, Pull Request, MCP tools/call or Computer Use action happened unless Chris Studio provided a real tool receipt. Ask for explicit approval before any such action.\n\nPLAN\n${planText(plan)}${revision}`,
    },
    ...messages,
  ];
}

function reviewerMessages(
  userRequest: string,
  plan: AgentPlanStep[],
  draft: string,
): Pick<ChatMessage, 'role' | 'content'>[] {
  return [
    {
      role: 'system',
      content: 'You are the independent review role inside Chris Studio. Check whether the draft answers the request, follows the plan, respects approval boundaries, avoids unsupported claims, and identifies uncertainty. Return JSON only: {"verdict":"pass"|"revise","summary":"concise review","issues":["specific issue"]}. Do not rewrite the answer.',
    },
    {
      role: 'user',
      content: `USER REQUEST\n${userRequest.slice(0, 18_000)}\n\nPLAN\n${planText(plan)}\n\nDRAFT\n${draft.slice(0, 48_000)}`,
    },
  ];
}

function cancelled(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function mergeSignals(primary?: AbortSignal, secondary?: AbortSignal): { signal?: AbortSignal; cleanup: () => void } {
  if (!primary) return { signal: secondary, cleanup: () => undefined };
  if (!secondary) return { signal: primary, cleanup: () => undefined };
  const controller = new AbortController();
  const forward = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason || 'Stopped by user.');
  };
  const onPrimary = () => forward(primary);
  const onSecondary = () => forward(secondary);
  if (primary.aborted) onPrimary(); else primary.addEventListener('abort', onPrimary, { once: true });
  if (secondary.aborted) onSecondary(); else secondary.addEventListener('abort', onSecondary, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      primary.removeEventListener('abort', onPrimary);
      secondary.removeEventListener('abort', onSecondary);
    },
  };
}


const MAX_AGENT_RESUME_ATTEMPTS = 2;

function resumeAttemptCount(receipt: AgentRunReceipt): number {
  return receipt.resumeAttempts?.length ?? 0;
}

export function canResumeAgentRun(receipt: AgentRunReceipt): boolean {
  return Boolean(
    receipt.resumeStage
      && receipt.phase !== 'cancelled'
      && resumeAttemptCount(receipt) < MAX_AGENT_RESUME_ATTEMPTS,
  );
}

function markResumeStage(receipt: AgentRunReceipt, stage?: AgentResumeStage): void {
  receipt.resumeStage = stage && resumeAttemptCount(receipt) < MAX_AGENT_RESUME_ATTEMPTS ? stage : undefined;
}

function phaseResumeStage(phase: AgentRunPhase): AgentResumeStage | undefined {
  if (phase === 'planning') return 'planner';
  if (phase === 'executing') return 'executor';
  if (phase === 'reviewing' || phase === 'partial') return 'reviewer';
  if (phase === 'revising') return 'revision';
  return undefined;
}

function previousRole(
  previousReceipt: AgentRunReceipt,
  role: AgentRole,
  profile: ProviderProfile,
  completed: boolean,
): AgentRoleReceipt {
  const previous = previousReceipt.roles.find((entry) => entry.role === role);
  if (previous && completed) return { ...previous, status: 'completed' };
  return roleReceipt(role, profile);
}

function beginResumeAttempt(previousReceipt: AgentRunReceipt, stage: AgentResumeStage): AgentResumeAttempt {
  return {
    stage,
    previousRunId: previousReceipt.id,
    startedAt: nowIso(),
    status: 'running',
    message: previousReceipt.errorMessage || previousReceipt.reviewSummary,
  };
}

function updateResumeAttempt(
  receipt: AgentRunReceipt,
  status: AgentResumeAttempt['status'],
  message?: string,
): void {
  if (!receipt.resumeAttempts?.length) return;
  const index = receipt.resumeAttempts.length - 1;
  receipt.resumeAttempts = receipt.resumeAttempts.map((attempt, attemptIndex) => attemptIndex === index
    ? { ...attempt, status, finishedAt: nowIso(), message: message || attempt.message }
    : attempt);
}

export async function runCollaborativeAgent(input: CollaborativeAgentInput): Promise<CollaborativeAgentResult> {
  const transport = input.transport ?? { send: sendProviderChat, stream: sendProviderChatStream };
  const roles = resolveAgentRoleProfiles(input.agent, input.profiles, input.defaultProfile);
  ensureProfileReady('planner', roles.planner);
  ensureProfileReady('executor', roles.executor);
  ensureProfileReady('reviewer', roles.reviewer);

  const parent = beginRuntimeRun({
    kind: 'agent',
    task: lastUserText(input.messages).slice(0, 500),
    provider: `${roles.planner.displayName} → ${roles.executor.displayName} → ${roles.reviewer.displayName}`,
    model: roles.executor.model,
    action: 'plan-execute-review',
    maxAttempts: input.agent.maxRevisionRounds === 1 ? 4 : 3,
  });
  const linked = mergeSignals(input.signal, getRuntimeSignal(parent.id));
  const signal = linked.signal;
  const receipt: AgentRunReceipt = {
    id: parent.id,
    mode: 'plan-execute-review',
    phase: 'planning',
    startedAt: nowIso(),
    plan: [],
    roles: [roleReceipt('planner', roles.planner), roleReceipt('executor', roles.executor), roleReceipt('reviewer', roles.reviewer)],
    inputAttachmentCount: input.attachments.length,
    inputVisionAttachmentCount: input.includeVisionImages
      ? input.attachments.filter((attachment) => attachment.kind === 'image' && attachment.dataUrl).length
      : 0,
  };
  emit(input.callbacks, receipt);

  const fail = (
    message: string,
    phase: AgentRunPhase = 'failed',
    resumeStage: AgentResumeStage | undefined = phaseResumeStage(receipt.phase),
  ): CollaborativeAgentResult => {
    receipt.phase = phase;
    receipt.errorMessage = message;
    receipt.finishedAt = nowIso();
    markResumeStage(receipt, phase === 'cancelled' ? undefined : resumeStage);
    emit(input.callbacks, receipt);
    finishRuntimeRun(parent.id, phase === 'cancelled' ? 'cancelled' : 'failed', message);
    return { ok: false, content: '', receipt: cloneReceipt(receipt), executorProfile: roles.executor, errorMessage: message };
  };

  try {
    if (cancelled(signal)) return fail('Agent collaboration stopped before planning.', 'cancelled');
    updateRuntimeRun(parent.id, { status: 'planning', message: 'Planner is preparing an auditable execution plan.' });
    updateRole(receipt, 'planner', { status: 'running', startedAt: nowIso() });
    emit(input.callbacks, receipt);

    const planner = await transport.send(
      roles.planner,
      plannerMessages(input.messages, input.agent),
      input.timeoutMs,
      roles.planner.model,
      [],
      false,
      { parentId: parent.id, role: 'planner', task: 'Prepare the Agent execution plan', signal },
    );
    if (!planner.ok || !planner.content?.trim()) {
      updateRole(receipt, 'planner', { status: cancelled(signal) ? 'cancelled' : 'failed', finishedAt: nowIso(), message: planner.errorMessage || 'Planner returned no usable plan.' });
      return fail(planner.errorMessage || 'Planner returned no usable plan.', cancelled(signal) ? 'cancelled' : 'failed', 'planner');
    }

    receipt.plan = parseAgentPlan(planner.content);
    updateRole(receipt, 'planner', { status: 'completed', finishedAt: nowIso(), message: `${receipt.plan.length} reviewed steps prepared.` });
    receipt.plan = receipt.plan.map((step, index) => index === 0 ? { ...step, status: 'running' } : step);
    setPhase(receipt, 'executing', input.callbacks);
    updateRuntimeRun(parent.id, { status: 'running', message: 'Executor is producing the user-facing result.' });
    updateRole(receipt, 'executor', { status: 'running', startedAt: nowIso() });
    emit(input.callbacks, receipt);

    let draft = '';
    let executorResult: ProviderReply = await transport.stream(
      roles.executor,
      executorMessages(input.messages, input.agent, receipt.plan),
      input.timeoutMs,
      roles.executor.model,
      input.attachments,
      input.includeVisionImages,
      {
        onDelta: (delta) => {
          draft += delta;
          input.callbacks.onExecutorDelta(delta);
        },
        onReasoning: input.callbacks.onExecutorReasoning,
      },
      signal,
      { parentId: parent.id, role: 'executor', task: 'Execute the reviewed Agent plan' },
    );
    if (!executorResult.ok || !(draft || executorResult.content)?.trim()) {
      updateRole(receipt, 'executor', { status: cancelled(signal) ? 'cancelled' : 'failed', finishedAt: nowIso(), message: executorResult.errorMessage || 'Executor returned no usable result.' });
      return fail(executorResult.errorMessage || 'Executor returned no usable result.', cancelled(signal) ? 'cancelled' : 'failed', 'executor');
    }
    draft = draft || executorResult.content || '';
    receipt.plan = receipt.plan.map((step) => ({ ...step, status: 'completed' }));
    updateRole(receipt, 'executor', { status: 'completed', finishedAt: nowIso(), message: 'Draft completed.' });

    setPhase(receipt, 'reviewing', input.callbacks);
    updateRuntimeRun(parent.id, { status: 'checking', message: 'Reviewer is checking the draft independently.' });
    updateRole(receipt, 'reviewer', { status: 'running', startedAt: nowIso() });
    emit(input.callbacks, receipt);

    const reviewer = await transport.send(
      roles.reviewer,
      reviewerMessages(lastUserText(input.messages), receipt.plan, draft),
      input.timeoutMs,
      roles.reviewer.model,
      [],
      false,
      { parentId: parent.id, role: 'reviewer', task: 'Review the Agent draft', signal },
    );
    if (!reviewer.ok || !reviewer.content?.trim()) {
      const message = reviewer.errorMessage || 'Reviewer returned no usable result.';
      receipt.reviewVerdict = 'unavailable';
      receipt.reviewSummary = message;
      updateRole(receipt, 'reviewer', { status: cancelled(signal) ? 'cancelled' : 'failed', finishedAt: nowIso(), message });
      receipt.phase = cancelled(signal) ? 'cancelled' : 'partial';
      receipt.finishedAt = nowIso();
      markResumeStage(receipt, cancelled(signal) ? undefined : 'reviewer');
      emit(input.callbacks, receipt);
      finishRuntimeRun(parent.id, cancelled(signal) ? 'cancelled' : 'completed', cancelled(signal) ? message : 'Executor completed; independent review was unavailable.');
      return { ok: !cancelled(signal), content: draft, receipt: cloneReceipt(receipt), executorProfile: roles.executor, errorMessage: cancelled(signal) ? message : undefined };
    }

    const review = parseAgentReview(reviewer.content);
    receipt.reviewVerdict = review.verdict;
    receipt.reviewSummary = [review.summary, ...review.issues.map((issue) => `• ${issue}`)].filter(Boolean).join('\n');
    updateRole(receipt, 'reviewer', { status: 'completed', finishedAt: nowIso(), message: review.summary });
    emit(input.callbacks, receipt);

    if (review.verdict === 'revise' && input.agent.maxRevisionRounds === 1) {
      receipt.phase = 'revising';
      updateRole(receipt, 'executor', { status: 'running', startedAt: nowIso(), finishedAt: undefined, message: 'Applying one bounded reviewer revision.' });
      input.callbacks.onResetExecutor?.();
      emit(input.callbacks, receipt);
      updateRuntimeRun(parent.id, { status: 'repairing', message: 'Executor is applying one bounded reviewer revision.' });

      let revised = '';
      executorResult = await transport.stream(
        roles.executor,
        executorMessages(input.messages, input.agent, receipt.plan, review),
        input.timeoutMs,
        roles.executor.model,
        input.attachments,
        input.includeVisionImages,
        {
          onDelta: (delta) => {
            revised += delta;
            input.callbacks.onExecutorDelta(delta);
          },
          onReasoning: input.callbacks.onExecutorReasoning,
        },
        signal,
        { parentId: parent.id, role: 'executor-revision', task: 'Apply the bounded reviewer revision' },
      );
      if (!executorResult.ok || !(revised || executorResult.content)?.trim()) {
        updateRole(receipt, 'executor', { status: cancelled(signal) ? 'cancelled' : 'failed', finishedAt: nowIso(), message: executorResult.errorMessage || 'Revision failed.' });
        return fail(executorResult.errorMessage || 'Revision failed.', cancelled(signal) ? 'cancelled' : 'failed', 'revision');
      }
      draft = revised || executorResult.content || draft;
      updateRole(receipt, 'executor', { status: 'completed', finishedAt: nowIso(), message: 'One bounded revision applied.' });
    }

    receipt.phase = 'completed';
    receipt.finishedAt = nowIso();
    markResumeStage(receipt, undefined);
    emit(input.callbacks, receipt);
    finishRuntimeRun(parent.id, 'completed', review.verdict === 'pass' ? 'Plan, execution and independent review completed.' : 'Execution completed with reviewer feedback recorded.');
    return { ok: true, content: draft, receipt: cloneReceipt(receipt), executorProfile: roles.executor };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (cancelled(signal)) return fail(message || 'Agent collaboration stopped.', 'cancelled');
    return fail(message || 'Agent collaboration failed.');
  } finally {
    linked.cleanup();
    if (signal?.aborted) requestRuntimeStop(parent.id, String(signal.reason || 'Stopped by user.'));
  }
}


function decoratePlannerResumeReceipt(
  receipt: AgentRunReceipt,
  previousReceipt: AgentRunReceipt,
  attempt: AgentResumeAttempt,
): AgentRunReceipt {
  const terminal = ['completed', 'partial', 'failed', 'cancelled'].includes(receipt.phase);
  const status: AgentResumeAttempt['status'] = receipt.phase === 'completed'
    ? 'completed'
    : receipt.phase === 'cancelled'
      ? 'cancelled'
      : terminal
        ? 'failed'
        : 'running';
  const currentAttempt: AgentResumeAttempt = {
    ...attempt,
    status,
    finishedAt: terminal ? receipt.finishedAt || nowIso() : undefined,
    message: receipt.errorMessage || receipt.reviewSummary || attempt.message,
  };
  const decorated: AgentRunReceipt = {
    ...receipt,
    resumedFromRunId: previousReceipt.id,
    resumeAttempts: [...(previousReceipt.resumeAttempts ?? []), currentAttempt],
    inputAttachmentCount: previousReceipt.inputAttachmentCount ?? receipt.inputAttachmentCount,
    inputVisionAttachmentCount: previousReceipt.inputVisionAttachmentCount ?? receipt.inputVisionAttachmentCount,
  };
  if (resumeAttemptCount(decorated) >= MAX_AGENT_RESUME_ATTEMPTS && decorated.phase !== 'completed') {
    decorated.resumeStage = undefined;
  }
  return decorated;
}

export async function resumeCollaborativeAgent(input: ResumeCollaborativeAgentInput): Promise<CollaborativeAgentResult> {
  const stage = input.previousReceipt.resumeStage;
  if (!stage || !canResumeAgentRun(input.previousReceipt)) {
    throw new Error('This Agent receipt has no recoverable checkpoint or has reached the two-attempt recovery limit.');
  }
  if (
    input.previousReceipt.inputVisionAttachmentCount
    && input.previousReceipt.inputVisionAttachmentCount > 0
    && (stage === 'executor' || stage === 'revision')
  ) {
    throw new Error('This checkpoint depended on reviewed vision images. Reattach the images and start a new Agent run instead of resuming without them.');
  }

  const attempt = beginResumeAttempt(input.previousReceipt, stage);
  if (stage === 'planner') {
    const callbacks: AgentCollaborationCallbacks = {
      ...input.callbacks,
      onReceipt: (receipt) => input.callbacks.onReceipt?.(
        decoratePlannerResumeReceipt(receipt, input.previousReceipt, attempt),
      ),
    };
    const result = await runCollaborativeAgent({ ...input, callbacks });
    const receipt = decoratePlannerResumeReceipt(result.receipt, input.previousReceipt, attempt);
    return { ...result, receipt };
  }

  const transport = input.transport ?? { send: sendProviderChat, stream: sendProviderChatStream };
  const roleAgent: AgentProfile = { ...input.agent, plannerProviderProfileId: undefined };
  const roles = resolveAgentRoleProfiles(roleAgent, input.profiles, input.defaultProfile);
  if (stage === 'executor' || stage === 'revision') ensureProfileReady('executor', roles.executor);
  if (stage === 'executor' || stage === 'reviewer') ensureProfileReady('reviewer', roles.reviewer);

  const parent = beginRuntimeRun({
    kind: 'agent',
    task: `Resume ${stage}: ${lastUserText(input.messages).slice(0, 440)}`,
    provider: stage === 'reviewer'
      ? roles.reviewer.displayName
      : `${roles.executor.displayName} → ${roles.reviewer.displayName}`,
    model: stage === 'reviewer' ? roles.reviewer.model : roles.executor.model,
    action: `resume-${stage}`,
    maxAttempts: 1,
  });
  const linked = mergeSignals(input.signal, getRuntimeSignal(parent.id));
  const signal = linked.signal;
  const plannerCompleted = true;
  const executorCompleted = stage === 'reviewer' || stage === 'revision';
  const reviewerCompleted = stage === 'revision';
  const receipt: AgentRunReceipt = {
    id: parent.id,
    mode: 'plan-execute-review',
    phase: stage === 'executor' ? 'executing' : stage === 'reviewer' ? 'reviewing' : 'revising',
    startedAt: nowIso(),
    plan: input.previousReceipt.plan.map((step) => ({ ...step })),
    roles: [
      previousRole(input.previousReceipt, 'planner', roles.planner, plannerCompleted),
      previousRole(input.previousReceipt, 'executor', roles.executor, executorCompleted),
      previousRole(input.previousReceipt, 'reviewer', roles.reviewer, reviewerCompleted),
    ],
    reviewSummary: input.previousReceipt.reviewSummary,
    reviewVerdict: input.previousReceipt.reviewVerdict,
    resumedFromRunId: input.previousReceipt.id,
    resumeAttempts: [...(input.previousReceipt.resumeAttempts ?? []), attempt],
    inputAttachmentCount: input.previousReceipt.inputAttachmentCount,
    inputVisionAttachmentCount: input.previousReceipt.inputVisionAttachmentCount,
  };
  emit(input.callbacks, receipt);

  let draft = input.existingDraft.trim();
  const fail = (
    message: string,
    retryStage: AgentResumeStage,
    phase: AgentRunPhase = 'failed',
  ): CollaborativeAgentResult => {
    receipt.phase = phase;
    receipt.errorMessage = message;
    receipt.finishedAt = nowIso();
    updateResumeAttempt(receipt, phase === 'cancelled' ? 'cancelled' : 'failed', message);
    markResumeStage(receipt, phase === 'cancelled' ? undefined : retryStage);
    emit(input.callbacks, receipt);
    finishRuntimeRun(parent.id, phase === 'cancelled' ? 'cancelled' : 'failed', message);
    return {
      ok: false,
      content: draft,
      receipt: cloneReceipt(receipt),
      executorProfile: roles.executor,
      errorMessage: message,
    };
  };

  const complete = (message: string): CollaborativeAgentResult => {
    receipt.phase = 'completed';
    receipt.finishedAt = nowIso();
    receipt.errorMessage = undefined;
    markResumeStage(receipt, undefined);
    updateResumeAttempt(receipt, 'completed', message);
    emit(input.callbacks, receipt);
    finishRuntimeRun(parent.id, 'completed', message);
    return {
      ok: true,
      content: draft,
      receipt: cloneReceipt(receipt),
      executorProfile: roles.executor,
    };
  };

  const executeDraft = async (revision?: ParsedReview): Promise<ProviderReply> => {
    updateRuntimeRun(parent.id, {
      status: revision ? 'repairing' : 'running',
      message: revision ? 'Executor is resuming the bounded revision.' : 'Executor is resuming from the reviewed plan checkpoint.',
    });
    updateRole(receipt, 'executor', {
      status: 'running',
      startedAt: nowIso(),
      finishedAt: undefined,
      message: revision ? 'Resuming one bounded revision.' : 'Resuming from the saved Planner checkpoint.',
    });
    receipt.phase = revision ? 'revising' : 'executing';
    receipt.plan = receipt.plan.map((step, index) => revision
      ? { ...step, status: 'completed' }
      : index === 0 ? { ...step, status: 'running' } : { ...step, status: 'pending' });
    if (revision) input.callbacks.onResetExecutor?.();
    emit(input.callbacks, receipt);

    let streamed = '';
    const result = await transport.stream(
      roles.executor,
      executorMessages(input.messages, input.agent, receipt.plan, revision),
      input.timeoutMs,
      roles.executor.model,
      [],
      false,
      {
        onDelta: (delta) => {
          streamed += delta;
          input.callbacks.onExecutorDelta(delta);
        },
        onReasoning: input.callbacks.onExecutorReasoning,
      },
      signal,
      {
        parentId: parent.id,
        role: revision ? 'executor-revision-resume' : 'executor-resume',
        task: revision ? 'Resume the bounded reviewer revision' : 'Resume the reviewed Agent plan',
      },
    );
    if (result.ok && (streamed || result.content)?.trim()) {
      draft = streamed || result.content || draft;
      receipt.plan = receipt.plan.map((step) => ({ ...step, status: 'completed' }));
      updateRole(receipt, 'executor', {
        status: 'completed',
        finishedAt: nowIso(),
        message: revision ? 'Bounded revision resumed and completed.' : 'Executor checkpoint resumed and completed.',
      });
      emit(input.callbacks, receipt);
    }
    return result;
  };

  const reviewDraft = async (): Promise<ProviderReply> => {
    if (!draft) {
      return {
        ok: false,
        status: 0,
        latencyMs: 0,
        errorMessage: 'The saved checkpoint does not contain an Executor draft to review.',
      };
    }
    receipt.phase = 'reviewing';
    updateRuntimeRun(parent.id, { status: 'checking', message: 'Reviewer is resuming from the saved draft checkpoint.' });
    updateRole(receipt, 'reviewer', {
      status: 'running',
      startedAt: nowIso(),
      finishedAt: undefined,
      message: 'Reviewing the saved Executor draft.',
    });
    emit(input.callbacks, receipt);
    return transport.send(
      roles.reviewer,
      reviewerMessages(lastUserText(input.messages), receipt.plan, draft),
      input.timeoutMs,
      roles.reviewer.model,
      [],
      false,
      { parentId: parent.id, role: 'reviewer-resume', task: 'Resume independent Agent review', signal },
    );
  };

  try {
    if (cancelled(signal)) return fail('Agent checkpoint recovery was stopped before it began.', stage, 'cancelled');

    if (stage === 'executor') {
      if (!receipt.plan.length) {
        return fail('The saved receipt has no Planner checkpoint. Restart the full Agent workflow.', 'planner');
      }
      const executor = await executeDraft();
      if (!executor.ok || !draft) {
        updateRole(receipt, 'executor', {
          status: cancelled(signal) ? 'cancelled' : 'failed',
          finishedAt: nowIso(),
          message: executor.errorMessage || 'Executor recovery returned no usable result.',
        });
        return fail(
          executor.errorMessage || 'Executor recovery returned no usable result.',
          'executor',
          cancelled(signal) ? 'cancelled' : 'failed',
        );
      }
    }

    if (stage === 'revision') {
      if (!draft) return fail('The saved receipt has no draft for bounded revision recovery.', 'revision');
      const feedback: ParsedReview = {
        verdict: 'revise',
        summary: input.previousReceipt.reviewSummary || 'Apply the previously requested bounded revision.',
        issues: [],
      };
      const revision = await executeDraft(feedback);
      if (!revision.ok || !draft) {
        updateRole(receipt, 'executor', {
          status: cancelled(signal) ? 'cancelled' : 'failed',
          finishedAt: nowIso(),
          message: revision.errorMessage || 'Revision recovery returned no usable result.',
        });
        return fail(
          revision.errorMessage || 'Revision recovery returned no usable result.',
          'revision',
          cancelled(signal) ? 'cancelled' : 'failed',
        );
      }
      return complete('The bounded reviewer revision resumed from its checkpoint and completed.');
    }

    const reviewer = await reviewDraft();
    if (!reviewer.ok || !reviewer.content?.trim()) {
      const message = reviewer.errorMessage || 'Reviewer recovery returned no usable result.';
      receipt.reviewVerdict = 'unavailable';
      receipt.reviewSummary = message;
      updateRole(receipt, 'reviewer', {
        status: cancelled(signal) ? 'cancelled' : 'failed',
        finishedAt: nowIso(),
        message,
      });
      receipt.phase = cancelled(signal) ? 'cancelled' : 'partial';
      receipt.finishedAt = nowIso();
      updateResumeAttempt(receipt, cancelled(signal) ? 'cancelled' : 'failed', message);
      markResumeStage(receipt, cancelled(signal) ? undefined : 'reviewer');
      emit(input.callbacks, receipt);
      finishRuntimeRun(
        parent.id,
        cancelled(signal) ? 'cancelled' : 'completed',
        cancelled(signal) ? message : 'Executor draft preserved; independent review recovery remains available.',
      );
      return {
        ok: !cancelled(signal),
        content: draft,
        receipt: cloneReceipt(receipt),
        executorProfile: roles.executor,
        errorMessage: cancelled(signal) ? message : undefined,
      };
    }

    const review = parseAgentReview(reviewer.content);
    receipt.reviewVerdict = review.verdict;
    receipt.reviewSummary = [review.summary, ...review.issues.map((issue) => `• ${issue}`)].filter(Boolean).join('\n');
    updateRole(receipt, 'reviewer', {
      status: 'completed',
      finishedAt: nowIso(),
      message: review.summary,
    });
    emit(input.callbacks, receipt);

    if (review.verdict === 'revise' && input.agent.maxRevisionRounds === 1) {
      const revision = await executeDraft(review);
      if (!revision.ok || !draft) {
        updateRole(receipt, 'executor', {
          status: cancelled(signal) ? 'cancelled' : 'failed',
          finishedAt: nowIso(),
          message: revision.errorMessage || 'Revision recovery returned no usable result.',
        });
        return fail(
          revision.errorMessage || 'Revision recovery returned no usable result.',
          'revision',
          cancelled(signal) ? 'cancelled' : 'failed',
        );
      }
    }

    return complete(
      stage === 'reviewer'
        ? 'Independent review resumed from the saved Executor draft and completed.'
        : 'Executor and Reviewer resumed from the saved Planner checkpoint and completed.',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(
      message || 'Agent checkpoint recovery failed.',
      phaseResumeStage(receipt.phase) || stage,
      cancelled(signal) ? 'cancelled' : 'failed',
    );
  } finally {
    linked.cleanup();
    if (signal?.aborted) requestRuntimeStop(parent.id, String(signal.reason || 'Stopped by user.'));
  }
}
