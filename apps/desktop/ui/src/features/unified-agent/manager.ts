import type { AttachmentDraft, ChatMessage, Conversation, ProviderProfile } from '../../app/types';
import {
  loadConversations,
  loadProjectRoot,
  makeId,
  nowIso,
  saveConversation,
} from '../../app/store';
import { providerDefinition } from '../../app/providerRegistry';
import { sendProviderChatStream } from '../providers/providerClientReliable';
import { executeUnifiedTool, type UnifiedToolContext } from './toolRegistry';
import {
  observationMessage,
  parseUnifiedAgentDecision,
  unifiedAgentSystemPrompt,
} from './protocol';
import { denyApprovalsForRun, requestUnifiedApproval } from './approvalBroker';
import {
  appendToolEvent,
  setConversationRuntimeState,
  updateToolEvent,
  updateUnifiedRun,
  upsertUnifiedRun,
} from './runtimeStore';
import type {
  UnifiedAgentEnqueueInput,
  UnifiedAgentRun,
  UnifiedToolEvent,
  UnifiedToolObservation,
} from './types';

interface QueueItem extends UnifiedAgentEnqueueInput {
  runId: string;
}

interface ActiveRun {
  runId: string;
  controller: AbortController;
}

interface EnqueueResult {
  accepted: boolean;
  duplicate: boolean;
  runId?: string;
  reason?: string;
}

const MAX_AGENT_LOOPS = 20;
const queues = new Map<string, QueueItem[]>();
const active = new Map<string, ActiveRun>();
const acceptedRequestIds = new Set<string>();

function getConversation(id: string): Conversation | undefined {
  return loadConversations().find((entry) => entry.id === id);
}

function updateConversation(id: string, updater: (conversation: Conversation) => Conversation): Conversation | undefined {
  const current = getConversation(id);
  if (!current) return undefined;
  const next = updater(current);
  saveConversation(next);
  window.dispatchEvent(new CustomEvent('chris-studio:conversation-live-updated', { detail: { id } }));
  return next;
}

function appendAssistantMessage(
  conversationId: string,
  content: string,
  provider: ProviderProfile,
  failed = false,
  messageId = makeId('assistant'),
): string {
  updateConversation(conversationId, (conversation) => ({
    ...conversation,
    updatedAt: nowIso(),
    provider: provider.displayName,
    model: provider.model,
    messages: [
      ...conversation.messages,
      {
        id: messageId,
        role: 'assistant',
        content,
        createdAt: nowIso(),
        provider: provider.displayName,
        model: provider.model,
        failed,
      },
    ],
  }));
  return messageId;
}

function replaceAssistantMessage(
  conversationId: string,
  messageId: string,
  content: string,
  provider: ProviderProfile,
  failed = false,
): void {
  updateConversation(conversationId, (conversation) => ({
    ...conversation,
    updatedAt: nowIso(),
    provider: provider.displayName,
    model: provider.model,
    messages: conversation.messages.map((message) => message.id === messageId
      ? { ...message, content, provider: provider.displayName, model: provider.model, failed }
      : message),
  }));
}

function limitedHistory(conversation: Conversation): Pick<ChatMessage, 'role' | 'content'>[] {
  return conversation.messages
    .filter((message) => message.role !== 'system' && message.content.trim())
    .slice(-24)
    .map((message) => ({ role: message.role, content: message.content }));
}

function providerError(reply: { errorMessage?: string; content?: string }): string {
  return reply.errorMessage || reply.content || 'The selected provider did not return a usable response.';
}

function buildScreenshotAttachment(dataUrl: string): AttachmentDraft {
  return {
    id: makeId('agent-screen'),
    name: 'current-screen.png',
    size: dataUrl.length,
    content: 'Current user-approved macOS screenshot for the next Unified Agent decision.',
    kind: 'image',
    processor: 'local-ocr',
    mimeType: 'image/png',
    dataUrl,
  };
}

function aborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException(String(signal.reason || 'Stopped by user.'), 'AbortError');
}

function updateQueueReceipts(conversationId: string): void {
  const queue = queues.get(conversationId) || [];
  queue.forEach((item, index) => updateUnifiedRun(item.runId, { queuePosition: index + 1, status: 'queued' }));
  setConversationRuntimeState(conversationId, active.get(conversationId)?.runId, queue.length);
}

async function askModel(
  run: UnifiedAgentRun,
  provider: ProviderProfile,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  timeoutMs: number,
  signal: AbortSignal,
  screenshotDataUrl?: string,
): Promise<string> {
  if (provider.providerId === 'local-demo') {
    throw new Error('Unified Agent requires a configured model provider. Local Sandbox cannot choose real tools.');
  }
  let content = '';
  const definition = providerDefinition(provider.providerId);
  const includeScreenshot = Boolean(screenshotDataUrl && definition.capabilities.vision);
  const attachments = includeScreenshot && screenshotDataUrl ? [buildScreenshotAttachment(screenshotDataUrl)] : [];
  const reply = await sendProviderChatStream(
    provider,
    messages,
    timeoutMs,
    provider.model,
    attachments,
    includeScreenshot,
    {
      onDelta: (delta) => {
        content += delta;
        updateUnifiedRun(run.id, {
          assistantDraft: content.slice(-4_000),
          status: 'planning',
        });
      },
      onReasoning: () => undefined,
      onStatus: () => undefined,
    },
    signal,
    { parentId: run.id, task: run.goal, role: 'unified-agent-decision' },
  );
  if (!reply.ok) throw new Error(providerError(reply));
  return content || reply.content || '';
}

async function runChat(item: QueueItem, controller: AbortController): Promise<void> {
  const run = updateUnifiedRun(item.runId, { status: 'running', loop: 1, queuePosition: undefined });
  if (!run) return;
  const conversation = getConversation(item.conversationId);
  if (!conversation) throw new Error('The conversation was removed before the queued message ran.');
  const messageId = makeId('assistant');
  appendAssistantMessage(item.conversationId, '', item.provider, false, messageId);
  let content = '';
  const reply = await sendProviderChatStream(
    item.provider,
    limitedHistory(conversation),
    item.requestTimeoutMs,
    item.provider.model,
    item.attachments || [],
    Boolean(item.attachments?.some((attachment) => attachment.kind === 'image' && attachment.dataUrl) && providerDefinition(item.provider.providerId).capabilities.vision),
    {
      onDelta: (delta) => {
        content += delta;
        replaceAssistantMessage(item.conversationId, messageId, content, item.provider);
        updateUnifiedRun(item.runId, { assistantDraft: content.slice(-4_000) });
      },
      onReasoning: () => undefined,
      onStatus: () => undefined,
    },
    controller.signal,
    { parentId: item.runId, task: item.goal, role: 'chat' },
  );
  if (!reply.ok) throw new Error(providerError(reply));
  const finalContent = content || reply.content || '';
  replaceAssistantMessage(item.conversationId, messageId, finalContent, item.provider);
  updateUnifiedRun(item.runId, {
    status: 'completed',
    assistantDraft: undefined,
    finalMessageId: messageId,
    finishedAt: nowIso(),
  });
}

async function runAgent(item: QueueItem, controller: AbortController): Promise<void> {
  const started = updateUnifiedRun(item.runId, { status: 'planning', queuePosition: undefined });
  if (!started) return;
  const conversation = getConversation(item.conversationId);
  if (!conversation) throw new Error('The conversation was removed before the queued Agent task ran.');
  const readPaths = new Set<string>();
  const ownedPaths = new Set<string>();
  const contextMessages: Pick<ChatMessage, 'role' | 'content'>[] = [
    { role: 'system', content: unifiedAgentSystemPrompt(loadProjectRoot()) },
    ...limitedHistory(conversation),
  ];
  if (item.attachments?.length) {
    const attachmentContext = item.attachments.map((attachment) =>
      `Attachment: ${attachment.name}
${attachment.content.slice(0, 24_000)}`
    ).join('\n\n');
    contextMessages.push({ role: 'user', content: `User-approved local attachment context:
${attachmentContext}` });
  }
  let latestScreenshotDataUrl: string | undefined;
  let latestAccessibility: { app?: string; maxIndex: number } | undefined;
  let invalidDecisions = 0;

  for (let loop = 1; loop <= MAX_AGENT_LOOPS; loop += 1) {
    aborted(controller.signal);
    updateUnifiedRun(item.runId, { status: 'planning', loop, assistantDraft: undefined });
    let rawDecision = '';
    try {
      rawDecision = await askModel(
        started,
        item.provider,
        contextMessages,
        item.requestTimeoutMs,
        controller.signal,
        latestScreenshotDataUrl,
      );
    } catch (error) {
      throw error;
    }
    aborted(controller.signal);
    let decision;
    try {
      decision = parseUnifiedAgentDecision(rawDecision);
      invalidDecisions = 0;
    } catch (error) {
      invalidDecisions += 1;
      if (invalidDecisions >= 3) throw error;
      contextMessages.push({ role: 'assistant', content: rawDecision.slice(0, 12_000) });
      contextMessages.push({
        role: 'user',
        content: `Your previous response was not a valid Unified Agent JSON decision: ${error instanceof Error ? error.message : String(error)}. Return one valid JSON object now.`,
      });
      continue;
    }
    contextMessages.push({ role: 'assistant', content: rawDecision });
    if (decision.type === 'final') {
      const messageId = appendAssistantMessage(item.conversationId, decision.content, item.provider);
      updateUnifiedRun(item.runId, {
        status: 'completed',
        assistantDraft: undefined,
        finalMessageId: messageId,
        finishedAt: nowIso(),
      });
      return;
    }

    updateUnifiedRun(item.runId, { status: 'running', assistantDraft: undefined });
    for (const call of decision.calls) {
      aborted(controller.signal);
      const event: UnifiedToolEvent = {
        id: makeId('tool-event'),
        call,
        status: 'running',
        startedAt: nowIso(),
      };
      appendToolEvent(item.runId, event);
      let observation: UnifiedToolObservation;
      try {
        const toolContext: UnifiedToolContext = {
          runId: item.runId,
          eventId: event.id,
          readPaths,
          ownedPaths,
          latestScreenshotDataUrl,
          latestAccessibility,
          requestApproval: requestUnifiedApproval,
          updateEvent: (patch) => updateToolEvent(item.runId, event.id, patch),
        };
        observation = await executeUnifiedTool(call, toolContext);
        latestScreenshotDataUrl = toolContext.latestScreenshotDataUrl;
        latestAccessibility = toolContext.latestAccessibility;
        if (observation.screenshotDataUrl) latestScreenshotDataUrl = observation.screenshotDataUrl;
        if (call.name.startsWith('computer.') && call.name !== 'computer.capture' && call.name !== 'computer.inspect') {
          latestScreenshotDataUrl = undefined;
        }
        if (call.name.startsWith('computer.') && call.name !== 'computer.inspect') {
          latestAccessibility = undefined;
        }
        updateToolEvent(item.runId, event.id, {
          status: observation.ok ? 'completed' : 'failed',
          finishedAt: nowIso(),
          summary: observation.summary,
          output: observation.output,
          screenshotDataUrl: observation.screenshotDataUrl,
          sessionId: observation.sessionId,
          errorMessage: observation.ok ? undefined : observation.summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observation = { callId: call.id, name: call.name, ok: false, summary: message };
        updateToolEvent(item.runId, event.id, {
          status: 'failed',
          finishedAt: nowIso(),
          errorMessage: message,
          summary: message,
        });
      }
      updateUnifiedRun(item.runId, { status: 'running' });
      contextMessages.push({ role: 'user', content: observationMessage(observation) });
      if (observation.screenshotDataUrl && !providerDefinition(item.provider.providerId).capabilities.vision) {
        contextMessages.push({ role: 'user', content: 'The selected model cannot receive screenshots. Do not choose coordinate clicks; use approved keyboard/app actions or explain the limitation.' });
      }
    }
  }
  throw new Error(`Unified Agent reached its ${MAX_AGENT_LOOPS}-loop safety limit without a proven final result.`);
}

async function execute(item: QueueItem): Promise<void> {
  const controller = new AbortController();
  active.set(item.conversationId, { runId: item.runId, controller });
  updateQueueReceipts(item.conversationId);
  try {
    if (item.mode === 'agent') await runAgent(item, controller);
    else await runChat(item, controller);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    if (!cancelled) appendAssistantMessage(item.conversationId, `任务未完成：${message}`, item.provider, true);
    updateUnifiedRun(item.runId, {
      status: cancelled ? 'cancelled' : 'failed',
      assistantDraft: undefined,
      errorMessage: message,
      finishedAt: nowIso(),
    });
  } finally {
    denyApprovalsForRun(item.runId);
    active.delete(item.conversationId);
    acceptedRequestIds.delete(item.clientRequestId);
    updateQueueReceipts(item.conversationId);
    void drain(item.conversationId);
  }
}

async function drain(conversationId: string): Promise<void> {
  if (active.has(conversationId)) return;
  const queue = queues.get(conversationId) || [];
  const item = queue.shift();
  queues.set(conversationId, queue);
  updateQueueReceipts(conversationId);
  if (!item) return;
  await execute(item);
}

export const unifiedAgentManager = {
  enqueue(input: UnifiedAgentEnqueueInput): EnqueueResult {
    const goal = input.goal.trim();
    if (!goal) return { accepted: false, duplicate: false, reason: 'Message is empty.' };
    if (!input.conversationId.trim() || !input.clientRequestId.trim()) {
      return { accepted: false, duplicate: false, reason: 'Conversation request identity is missing.' };
    }
    if (acceptedRequestIds.has(input.clientRequestId)) {
      return { accepted: false, duplicate: true, reason: 'This message is already queued or running.' };
    }
    acceptedRequestIds.add(input.clientRequestId);
    const timestamp = nowIso();
    const runId = makeId('unified-run');
    const run: UnifiedAgentRun = {
      schemaVersion: 1,
      id: runId,
      conversationId: input.conversationId,
      clientRequestId: input.clientRequestId,
      mode: input.mode,
      goal,
      providerProfileId: input.provider.id,
      providerName: input.provider.displayName,
      model: input.provider.model,
      projectRoot: loadProjectRoot() || undefined,
      status: 'queued',
      loop: 0,
      maxLoops: input.mode === 'agent' ? MAX_AGENT_LOOPS : 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [],
      approvals: [],
    };
    upsertUnifiedRun(run);
    const queue = queues.get(input.conversationId) || [];
    queue.push({ ...input, goal, runId });
    queues.set(input.conversationId, queue);
    updateQueueReceipts(input.conversationId);
    window.queueMicrotask(() => void drain(input.conversationId));
    return { accepted: true, duplicate: false, runId };
  },

  stop(runId: string): boolean {
    for (const [conversationId, running] of active) {
      if (running.runId !== runId) continue;
      if (!running.controller.signal.aborted) running.controller.abort('Stopped by user.');
      denyApprovalsForRun(runId);
      updateUnifiedRun(runId, { status: 'cancelled', errorMessage: 'Stopped by user.', finishedAt: nowIso() });
      setConversationRuntimeState(conversationId, undefined, (queues.get(conversationId) || []).length);
      return true;
    }
    for (const [conversationId, queue] of queues) {
      const index = queue.findIndex((item) => item.runId === runId);
      if (index < 0) continue;
      const [removed] = queue.splice(index, 1);
      acceptedRequestIds.delete(removed.clientRequestId);
      queues.set(conversationId, queue);
      updateUnifiedRun(runId, { status: 'cancelled', errorMessage: 'Removed from queue by user.', finishedAt: nowIso() });
      updateQueueReceipts(conversationId);
      return true;
    }
    return false;
  },
};
