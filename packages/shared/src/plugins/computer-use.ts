/* Computer Use Control Mode — permission-gated */

export interface ComputerUseRequest {
  id: string;
  action: "screenshot" | "click" | "type" | "scroll" | "keypress" | "shell";
  params: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "denied" | "executed";
  createdAt: number;
  approvedAt?: number;
  executedAt?: number;
  result?: string;
}

const requests: ComputerUseRequest[] = [];

export function requestComputerAction(
  action: ComputerUseRequest["action"],
  params: Record<string, unknown>,
  reason: string,
): ComputerUseRequest {
  const req: ComputerUseRequest = {
    id: `cu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    params,
    reason,
    status: "pending",
    createdAt: Date.now(),
  };
  requests.push(req);
  return req;
}

export function approveComputerAction(id: string): ComputerUseRequest | undefined {
  const req = requests.find((r) => r.id === id);
  if (req && req.status === "pending") {
    req.status = "approved";
    req.approvedAt = Date.now();
  }
  return req;
}

export function denyComputerAction(id: string): ComputerUseRequest | undefined {
  const req = requests.find((r) => r.id === id);
  if (req && req.status === "pending") {
    req.status = "denied";
  }
  return req;
}

export function markExecuted(id: string, result?: string): void {
  const req = requests.find((r) => r.id === id);
  if (req) {
    req.status = "executed";
    req.executedAt = Date.now();
    req.result = result;
  }
}

export function listComputerRequests(): ComputerUseRequest[] {
  return [...requests].sort((a, b) => b.createdAt - a.createdAt);
}

export function listPendingComputerRequests(): ComputerUseRequest[] {
  return requests.filter((r) => r.status === "pending");
}