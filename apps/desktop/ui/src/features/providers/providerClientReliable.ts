import {
  cancelProviderStream,
  sendProviderChat as sendProviderChatBase,
  sendProviderChatStream as sendProviderChatStreamBase,
  type ProviderReply,
  type ProviderStreamCallbacks,
} from "./providerClient";
export { cancelProviderStream };
import { ReliableRunController } from "../agent-runtime/reliableRun";
import {
  beginRuntimeRun,
  delayWithRuntimeStop,
  finishRuntimeRun,
  getRuntimeSignal,
  publishReliableReceipt,
  raceWithRuntimeStop,
  RuntimeStopError,
  updateRuntimeRun,
} from "../agent-runtime/runtimeStore";
import { normalizeProviderError } from "./providerTelemetry";

type ProviderSend = typeof sendProviderChatBase;
type ProviderResult = Awaited<ReturnType<ProviderSend>>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function taskFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return "Protected model request";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index] as { role?: unknown; content?: unknown };
    if (entry?.role === "user" && text(entry.content).trim()) return text(entry.content).trim().slice(0, 500);
  }
  return "Protected model request";
}

function providerLabel(profile: unknown): string {
  const value = profile as { displayName?: unknown; providerId?: unknown; id?: unknown };
  return text(value?.displayName) || text(value?.providerId) || text(value?.id) || "Model provider";
}

function resultOk(result: unknown): boolean {
  return Boolean((result as { ok?: unknown })?.ok);
}

function errorDetails(result: unknown): { message: string; status?: number; retryAfterMs?: number } {
  const value = result as {
    errorMessage?: unknown;
    status?: unknown;
    statusCode?: unknown;
    retryAfterMs?: unknown;
  };
  const statusValue = Number(value?.statusCode ?? value?.status);
  const retryValue = Number(value?.retryAfterMs);
  return {
    message: text(value?.errorMessage) || "Provider request failed.",
    status: Number.isFinite(statusValue) ? statusValue : undefined,
    retryAfterMs: Number.isFinite(retryValue) ? retryValue : undefined,
  };
}

function cancelledResult(message: string): ProviderResult {
  return { ok: false, errorMessage: message } as ProviderResult;
}

class ReliableRunTimedOutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReliableRunTimedOutError";
  }
}

async function raceWithReliableController<T>(
  runtimeId: string,
  controller: ReliableRunController,
  operation: Promise<T>,
): Promise<T> {
  const runtimeOperation = raceWithRuntimeStop(runtimeId, operation);
  const signal = controller.signal;
  if (signal.aborted) {
    throw new ReliableRunTimedOutError(String(signal.reason || "Reliable run timed out."));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ReliableRunTimedOutError(String(signal.reason || "Reliable run timed out.")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    runtimeOperation.then(
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

export const sendProviderChat: ProviderSend = (async (...args: Parameters<ProviderSend>) => {
  const [profile, messages, timeoutMs, model] = args;
  const provider = providerLabel(profile);
  const modelLabel = text(model) || text((profile as { model?: unknown })?.model) || undefined;
  const task = taskFromMessages(messages);
  const runtime = beginRuntimeRun({
    kind: "provider",
    task,
    provider,
    model: modelLabel,
    maxAttempts: 4,
  });
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  const controller = new ReliableRunController({
    task,
    runId: runtime.id,
    maxRepairAttempts: 3,
    maxLoops: 4,
    hardTimeoutMs: timeout > 0 ? Math.max(timeout + 5_000, timeout * 4) : undefined,
  });
  publishReliableReceipt(runtime.id, controller.start("planning"));

  try {
    for (;;) {
      const attempt = controller.beginLoop();
      updateRuntimeRun(runtime.id, {
        status: "running",
        attempt,
        message: attempt === 1 ? "Sending protected request." : `Retry ${attempt - 1} of 3.`,
      });
      controller.beginCheckpoint("provider-request", `${provider} request`, "running");
      publishReliableReceipt(runtime.id, controller.snapshot());

      let result: ProviderResult;
      try {
        result = await raceWithReliableController(runtime.id, controller, sendProviderChatBase(...args));
      } catch (error) {
        if (error instanceof RuntimeStopError || error instanceof ReliableRunTimedOutError) throw error;
        result = cancelledResult(error instanceof Error ? error.message : String(error));
      }

      if (resultOk(result)) {
        controller.finishCheckpoint("provider-request", true, `Completed on attempt ${attempt}.`);
        publishReliableReceipt(runtime.id, controller.complete());
        finishRuntimeRun(runtime.id, "completed", `Completed with ${provider}.`);
        return result;
      }

      const details = errorDetails(result);
      const normalized = normalizeProviderError(provider, details.message, {
        httpStatus: details.status,
        retryAfterMs: details.retryAfterMs,
      });
      controller.finishCheckpoint("provider-request", false, normalized.safeMessage);
      publishReliableReceipt(runtime.id, controller.snapshot());

      if (!normalized.retryable || !controller.beginRepair(normalized.safeMessage)) {
        publishReliableReceipt(runtime.id, controller.fail(normalized.safeMessage));
        finishRuntimeRun(runtime.id, "failed", normalized.safeMessage);
        return result;
      }

      publishReliableReceipt(runtime.id, controller.snapshot());
      const retryDelay = normalized.retryAfterMs ?? Math.min(4_000, 400 * 2 ** Math.max(0, attempt - 1));
      updateRuntimeRun(runtime.id, {
        status: "repairing",
        message: `Retrying after ${normalized.category} error.`,
        error: normalized.safeMessage,
      });
      await delayWithRuntimeStop(runtime.id, retryDelay);
    }
  } catch (error) {
    if (error instanceof RuntimeStopError) {
      publishReliableReceipt(runtime.id, controller.cancel(error.message));
      finishRuntimeRun(runtime.id, "cancelled", error.message);
      return cancelledResult(error.message);
    }
    if (error instanceof ReliableRunTimedOutError || controller.snapshot().status === "timed-out") {
      const receipt = controller.snapshot();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const message = receipt.stopReason || errorMessage || "Reliable provider run timed out.";
      publishReliableReceipt(runtime.id, receipt);
      finishRuntimeRun(runtime.id, "timed-out", message);
      return cancelledResult(message);
    }
    const normalized = normalizeProviderError(provider, error);
    publishReliableReceipt(runtime.id, controller.fail(normalized.safeMessage));
    finishRuntimeRun(runtime.id, "failed", normalized.safeMessage);
    return cancelledResult(normalized.safeMessage);
  }
}) as ProviderSend;

type ProviderStreamSend = (
  profile: Parameters<typeof sendProviderChatStreamBase>[0],
  messages: Parameters<typeof sendProviderChatStreamBase>[1],
  timeoutMs: Parameters<typeof sendProviderChatStreamBase>[2],
  modelOverride: Parameters<typeof sendProviderChatStreamBase>[3],
  attachments: Parameters<typeof sendProviderChatStreamBase>[4],
  includeVisionImages: Parameters<typeof sendProviderChatStreamBase>[5],
  callbacks: ProviderStreamCallbacks,
  signal?: AbortSignal,
) => Promise<ProviderReply>;

function linkedAbortController(signals: Array<AbortSignal | undefined>): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  for (const signal of signals) {
    if (!signal) continue;
    const forward = () => {
      if (!controller.signal.aborted) controller.abort(signal.reason || "Stopped by user.");
    };
    if (signal.aborted) forward();
    else {
      signal.addEventListener("abort", forward, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", forward));
    }
  }
  return { controller, cleanup: () => cleanups.forEach((cleanup) => cleanup()) };
}

/**
 * Reliable streaming wrapper. It retries only before the first streamed token,
 * preventing duplicate partial answers while still recovering from transient
 * connection, timeout, rate-limit and provider-server failures.
 */
export const sendProviderChatStream: ProviderStreamSend = async (
  profile,
  messages,
  timeoutMs,
  modelOverride,
  attachments,
  includeVisionImages,
  callbacks,
  externalSignal,
) => {
  const provider = providerLabel(profile);
  const modelLabel = text(modelOverride) || text((profile as { model?: unknown })?.model) || undefined;
  const task = taskFromMessages(messages);
  const runtime = beginRuntimeRun({
    kind: "provider",
    task,
    provider,
    model: modelLabel,
    maxAttempts: 4,
  });
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  const controller = new ReliableRunController({
    task,
    runId: runtime.id,
    maxRepairAttempts: 3,
    maxLoops: 4,
    hardTimeoutMs: timeout > 0 ? Math.max(timeout + 5_000, timeout * 4) : undefined,
  });
  publishReliableReceipt(runtime.id, controller.start("planning"));

  try {
    for (;;) {
      const attempt = controller.beginLoop();
      let receivedStreamData = false;
      updateRuntimeRun(runtime.id, {
        status: "running",
        attempt,
        message: attempt === 1 ? "Opening provider stream." : `Reconnecting stream ${attempt - 1} of 3.`,
      });
      controller.beginCheckpoint("provider-stream", `${provider} stream`, "running");
      publishReliableReceipt(runtime.id, controller.snapshot());

      const linked = linkedAbortController([externalSignal, getRuntimeSignal(runtime.id), controller.signal]);
      const wrappedCallbacks: ProviderStreamCallbacks = {
        onDelta: (delta) => {
          receivedStreamData = receivedStreamData || Boolean(delta);
          callbacks.onDelta(delta);
        },
        onReasoning: (delta) => {
          receivedStreamData = receivedStreamData || Boolean(delta);
          callbacks.onReasoning?.(delta);
        },
        onStatus: callbacks.onStatus,
      };

      let result: ProviderReply;
      try {
        result = await raceWithReliableController(
          runtime.id,
          controller,
          sendProviderChatStreamBase(
            profile,
            messages,
            timeoutMs,
            modelOverride,
            attachments,
            includeVisionImages,
            wrappedCallbacks,
            linked.controller.signal,
          ),
        );
      } finally {
        linked.cleanup();
      }

      if (result.ok) {
        controller.finishCheckpoint("provider-stream", true, `Completed on attempt ${attempt}.`);
        publishReliableReceipt(runtime.id, controller.complete());
        finishRuntimeRun(runtime.id, "completed", `Stream completed with ${provider}.`);
        return result;
      }

      const details = errorDetails(result);
      const normalized = normalizeProviderError(provider, details.message, {
        httpStatus: details.status,
        retryAfterMs: details.retryAfterMs,
      });
      controller.finishCheckpoint("provider-stream", false, normalized.safeMessage);
      publishReliableReceipt(runtime.id, controller.snapshot());

      const cancelled = result.errorCode === "CANCELLED" || externalSignal?.aborted || getRuntimeSignal(runtime.id)?.aborted;
      if (cancelled) {
        const message = details.message || "Provider stream stopped by user.";
        publishReliableReceipt(runtime.id, controller.cancel(message));
        finishRuntimeRun(runtime.id, "cancelled", message);
        return result;
      }

      // Never reconnect after visible output: doing so could duplicate text in the same assistant bubble.
      if (receivedStreamData || !normalized.retryable || !controller.beginRepair(normalized.safeMessage)) {
        publishReliableReceipt(runtime.id, controller.fail(normalized.safeMessage));
        finishRuntimeRun(runtime.id, "failed", normalized.safeMessage);
        return result;
      }

      publishReliableReceipt(runtime.id, controller.snapshot());
      const retryDelay = normalized.retryAfterMs ?? Math.min(4_000, 400 * 2 ** Math.max(0, attempt - 1));
      updateRuntimeRun(runtime.id, {
        status: "repairing",
        message: `Reconnecting after ${normalized.category} error.`,
        error: normalized.safeMessage,
      });
      await delayWithRuntimeStop(runtime.id, retryDelay);
    }
  } catch (error) {
    if (error instanceof RuntimeStopError || externalSignal?.aborted) {
      const message = error instanceof Error ? error.message : "Provider stream stopped by user.";
      publishReliableReceipt(runtime.id, controller.cancel(message));
      finishRuntimeRun(runtime.id, "cancelled", message);
      return { ok: false, status: 0, errorCode: "CANCELLED", errorMessage: message, latencyMs: 0 };
    }
    if (error instanceof ReliableRunTimedOutError || controller.snapshot().status === "timed-out") {
      const message = controller.snapshot().stopReason || (error instanceof Error ? error.message : "Provider stream timed out.");
      publishReliableReceipt(runtime.id, controller.snapshot());
      finishRuntimeRun(runtime.id, "timed-out", message);
      return { ok: false, status: 0, errorCode: "TIMEOUT", errorMessage: message, latencyMs: 0 };
    }
    const normalized = normalizeProviderError(provider, error);
    publishReliableReceipt(runtime.id, controller.fail(normalized.safeMessage));
    finishRuntimeRun(runtime.id, "failed", normalized.safeMessage);
    return { ok: false, status: 0, errorCode: "CLIENT_ERROR", errorMessage: normalized.safeMessage, latencyMs: 0 };
  }
};
