import { sendProviderChat as sendProviderChatBase } from "./providerClient";
import { ReliableRunController } from "../agent-runtime/reliableRun";
import {
  beginRuntimeRun,
  delayWithRuntimeStop,
  finishRuntimeRun,
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
