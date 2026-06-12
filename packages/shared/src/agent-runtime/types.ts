/* ── Agent Runtime Types ── */

export type RuntimeKind = "node" | "python" | "binary" | "shell" | "none";

export type PluginCategory =
  | "built-in"
  | "output"
  | "knowledge"
  | "media"
  | "api"
  | "computer-use"
  | "dev-tools";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export type PermissionKind =
  | "file-read"
  | "file-write"
  | "network-out"
  | "shell-exec"
  | "screenshot"
  | "clipboard-read"
  | "clipboard-write"
  | "obsidian-read"
  | "obsidian-write"
  | "api-call"
  | "media-ingest";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: PluginCategory;
  runtime: RuntimeKind;
  description: string;
  author?: string;
  permissions: PermissionKind[];
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  installDeps?: string[];
  entryPoint: string;
  minStudioVersion?: string;
  enabled?: boolean;
  installed?: boolean;
  installStatus?: "none" | "installing" | "installed" | "failed";
}

export interface AgentTask {
  id: string;
  label: string;
  category: string;
  steps: AgentStep[];
  createdAt: number;
  status: "pending" | "running" | "complete" | "failed" | "cancelled";
  permissions: PermissionRequest[];
}

export interface AgentStep {
  id: string;
  order: number;
  label: string;
  pluginId: string;
  action: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: "pending" | "running" | "complete" | "failed" | "skipped";
  error?: string;
}

export interface RuntimeEnvironment {
  runtimeId: string;
  pluginId: string;
  kind: RuntimeKind;
  path: string;
  workspacePath: string;
  logsPath: string;
  healthy: boolean;
  lastCheck: number;
  version?: string;
}

export interface CommandPlan {
  pluginId: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
}

export interface PermissionRequest {
  id: string;
  pluginId: string;
  kind: PermissionKind;
  description: string;
  granted: boolean;
  requestedAt: number;
  grantedAt?: number;
}

export interface ExecutionLogEntry {
  id: string;
  taskId: string;
  stepId?: string;
  pluginId: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SkillResult {
  pluginId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  logs: ExecutionLogEntry[];
  artifacts?: string[];
}

export interface RuntimeStatus {
  totalPlugins: number;
  installedPlugins: number;
  enabledPlugins: number;
  healthyRuntimes: number;
  unhealthyRuntimes: number;
  pendingApprovals: number;
}

export interface PluginInstallResult {
  pluginId: string;
  success: boolean;
  error?: string;
  installedAt: number;
  runtimeEnv?: RuntimeEnvironment;
}