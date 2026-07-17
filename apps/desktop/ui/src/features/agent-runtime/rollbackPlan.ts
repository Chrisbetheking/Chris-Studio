import type { PatchBackupReceipt, ReliableRunReceipt } from "./reliableRun";

export interface RollbackStep {
  order: number;
  targetPath: string;
  sourceBackupPath: string;
  expectedCurrentSha256?: string;
  expectedRestoredSha256?: string;
}

export interface RollbackPlan {
  schemaVersion: 1;
  runId: string;
  createdAt: number;
  steps: RollbackStep[];
}

function normalizeRelativePath(value: string, label: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized) throw new Error(`${label} is empty.`);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`${label} must stay inside the selected project.`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
  return normalized;
}

function toStep(receipt: PatchBackupReceipt, order: number): RollbackStep {
  const targetPath = normalizeRelativePath(receipt.path, "Patch target path");
  const sourceBackupPath = normalizeRelativePath(receipt.backupPath, "Backup path");
  if (!sourceBackupPath.startsWith(".tokenfence/backups/")) {
    throw new Error(`Backup path must use the compatibility backup directory: ${sourceBackupPath}`);
  }
  return {
    order,
    targetPath,
    sourceBackupPath,
    expectedCurrentSha256: receipt.sha256After,
    expectedRestoredSha256: receipt.sha256Before,
  };
}

export function buildRollbackPlan(receipt: ReliableRunReceipt, now = Date.now()): RollbackPlan {
  const seen = new Set<string>();
  const steps: RollbackStep[] = [];
  for (const backup of [...receipt.patchBackups].reverse()) {
    const step = toStep(backup, steps.length + 1);
    if (seen.has(step.targetPath)) continue;
    seen.add(step.targetPath);
    steps.push(step);
  }
  return {
    schemaVersion: 1,
    runId: receipt.runId,
    createdAt: now,
    steps,
  };
}

export function serializeRunReceipt(receipt: ReliableRunReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}
