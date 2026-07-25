export * from "./computerClient";

import {
  captureScreen as captureScreenBase,
  clickPointer as clickPointerBase,
  openApplication as openApplicationBase,
  pressKey as pressKeyBase,
  requestComputerPermissions as requestComputerPermissionsBase,
  typeText as typeTextBase,
} from "./computerClient";
import {
  buildCoordinateOverlay,
  ComputerUseSessionGuard,
  type ComputerActionKind,
  type CoordinateOverlay,
} from "../computer-use/sessionGuard";
import {
  beginRuntimeRun,
  finishRuntimeRun,
  publishComputerReceipt,
  raceWithRuntimeStop,
  RuntimeStopError,
  updateRuntimeRun,
} from "../agent-runtime/runtimeStore";

type UnknownResult = { ok?: boolean; message?: string; errorMessage?: string };

let activeRuntimeParentId: string | undefined;

/**
 * Groups approved desktop actions under the visible model-driven Computer Use
 * parent task. Manual actions remain standalone receipts.
 */
export async function withComputerRuntimeParent<T>(
  parentId: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = activeRuntimeParentId;
  activeRuntimeParentId = parentId?.trim() || undefined;
  try {
    return await operation();
  } finally {
    activeRuntimeParentId = previous;
  }
}

function isOk(result: unknown): boolean {
  return Boolean((result as UnknownResult)?.ok);
}

function resultMessage(result: unknown): string {
  const value = result as UnknownResult;
  return value?.message || value?.errorMessage || (isOk(result) ? "Completed." : "Computer action failed.");
}

function createComputerFailureResult<T>(action: string, message: string): T {
  return {
    ok: false,
    action,
    timestamp: Date.now(),
    message,
    errorMessage: message,
  } as unknown as T;
}

class ComputerGuardStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComputerGuardStoppedError";
  }
}

async function raceWithComputerGuard<T>(
  runtimeId: string,
  guard: ComputerUseSessionGuard,
  operation: Promise<T>,
): Promise<T> {
  const runtimeOperation = raceWithRuntimeStop(runtimeId, operation);
  const signal = guard.signal;
  if (signal.aborted) throw new ComputerGuardStoppedError(String(signal.reason || "Computer Use stopped."));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ComputerGuardStoppedError(String(signal.reason || "Computer Use stopped.")));
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

async function runComputerAction<T>(
  action: ComputerActionKind,
  task: string,
  invoke: () => Promise<T>,
  overlay?: CoordinateOverlay,
): Promise<T> {
  const runtime = beginRuntimeRun({
    kind: "computer",
    parentId: activeRuntimeParentId,
    task,
    action,
    maxAttempts: 1,
  });
  const guard = new ComputerUseSessionGuard({ sessionId: runtime.id });
  publishComputerReceipt(runtime.id, guard.start(), overlay);
  const ticket = guard.issueApproval(action, task);
  updateRuntimeRun(runtime.id, {
    status: "waiting-approval",
    message: "Workspace approval received; validating a one-time action ticket.",
  });
  guard.consumeApproval(ticket.id, action);
  publishComputerReceipt(runtime.id, guard.snapshot(), overlay);
  updateRuntimeRun(runtime.id, { status: "running", message: "Approved local action is running." });

  try {
    const result = await raceWithComputerGuard(runtime.id, guard, invoke());
    if (isOk(result)) {
      publishComputerReceipt(runtime.id, guard.complete(), overlay);
      finishRuntimeRun(runtime.id, "completed", resultMessage(result));
    } else {
      guard.emergencyStop(resultMessage(result));
      publishComputerReceipt(runtime.id, guard.snapshot(), overlay);
      finishRuntimeRun(runtime.id, "failed", resultMessage(result));
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const beforeStop = guard.snapshot();
    if (beforeStop.status === "active") guard.emergencyStop(message);
    const receipt = guard.snapshot();
    publishComputerReceipt(runtime.id, receipt, overlay);
    const status = error instanceof RuntimeStopError || receipt.status === "stopped"
      ? "cancelled"
      : receipt.status === "timed-out"
        ? "timed-out"
        : "failed";
    finishRuntimeRun(runtime.id, status, message);
    return createComputerFailureResult<T>(action, message);
  }
}

export const requestComputerPermissions: typeof requestComputerPermissionsBase = (async (
  ...args: Parameters<typeof requestComputerPermissionsBase>
) => {
  const runtime = beginRuntimeRun({
    kind: "computer",
    task: "Request macOS Computer Use permissions",
    action: "permissions",
    maxAttempts: 1,
  });
  updateRuntimeRun(runtime.id, { status: "running", message: "Opening macOS permission checks." });
  try {
    const result = await raceWithRuntimeStop(runtime.id, requestComputerPermissionsBase(...args));
    finishRuntimeRun(runtime.id, isOk(result) ? "completed" : "failed", resultMessage(result));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishRuntimeRun(runtime.id, error instanceof RuntimeStopError ? "cancelled" : "failed", message);
    return createComputerFailureResult<Awaited<ReturnType<typeof requestComputerPermissionsBase>>>("permissions", message);
  }
}) as typeof requestComputerPermissionsBase;


export const openApplication: typeof openApplicationBase = (async (...args: Parameters<typeof openApplicationBase>) => {
  const app = String(args[0] ?? "application");
  return runComputerAction("open", `Open reviewed application: ${app}`, () => openApplicationBase(...args));
}) as typeof openApplicationBase;

export const captureScreen: typeof captureScreenBase = (async (...args: Parameters<typeof captureScreenBase>) =>
  runComputerAction("screenshot", "Capture the current screen", () => captureScreenBase(...args))) as typeof captureScreenBase;

export const typeText: typeof typeTextBase = (async (...args: Parameters<typeof typeTextBase>) => {
  const value = String(args[0] ?? "");
  return runComputerAction("type", `Type ${value.length} reviewed characters`, () => typeTextBase(...args));
}) as typeof typeTextBase;

export const pressKey: typeof pressKeyBase = (async (...args: Parameters<typeof pressKeyBase>) =>
  runComputerAction("key", `Press reviewed key sequence: ${String(args[0] ?? "")}`, () => pressKeyBase(...args))) as typeof pressKeyBase;

export const clickPointer: typeof clickPointerBase = (async (...args: Parameters<typeof clickPointerBase>) => {
  const x = Number(args[0]);
  const y = Number(args[1]);
  let overlay: CoordinateOverlay | undefined;
  if (typeof window !== "undefined" && Number.isFinite(x) && Number.isFinite(y)) {
    try {
      overlay = buildCoordinateOverlay(x, y, {
        width: Math.max(1, window.screen?.width || window.innerWidth || x),
        height: Math.max(1, window.screen?.height || window.innerHeight || y),
        scaleFactor: window.devicePixelRatio || 1,
      });
    } catch {
      // The native client remains the final coordinate authority.
    }
  }
  return runComputerAction("click", `Click reviewed coordinate (${x}, ${y})`, () => clickPointerBase(...args), overlay);
}) as typeof clickPointerBase;
