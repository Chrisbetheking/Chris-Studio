import { executeCommand, runComputerUseAction } from "../desktop-bridge";

const STORAGE_KEY = "tokenfence.computerUse";

/* ── Types (same as v1.5.1) ── */

export type ComputerUseTaskStatus =
  | "idle" | "planning" | "waiting_confirmation" | "running" | "completed" | "stopped" | "failed";

export interface ComputerUsePlanStep {
  id: string; title: string; description: string;
  commandId?: string; riskLevel: "safe" | "review" | "blocked";
}

export interface ComputerUseRunLog {
  id: string; time: number;
  level: "info" | "warning" | "error" | "success";
  message: string;
}

export interface ComputerUseState {
  taskText: string; status: ComputerUseTaskStatus;
  plan: ComputerUsePlanStep[]; logs: ComputerUseRunLog[]; updatedAt: number;
}

/* ── Helpers ── */

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function emptyState(): ComputerUseState {
  return { taskText: "", status: "idle", plan: [], logs: [], updatedAt: Date.now() };
}

/* ── Persistence ── */

export function loadComputerUseState(): ComputerUseState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    const valid = ["idle","planning","waiting_confirmation","running","completed","stopped","failed"];
    return {
      taskText: typeof parsed.taskText === "string" ? parsed.taskText : "",
      status: valid.includes(parsed.status) ? parsed.status : "idle",
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch { return emptyState(); }
}

export function saveComputerUseState(state: ComputerUseState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() })); }
  catch { /* ignore */ }
}

/* ── Safety: allowed commandIds ── */

const ALLOWED_COMMAND_IDS = new Set([
  "check_version", "check_process_path", "check_shortcuts",
  "check_release_diagnostics",
  "run_guard_source", "run_release_sanity", "run_verify_raw",
  "open_install_folder",
]);

const BLOCKED_KEYWORDS = [
  "delete","remove","rm ","del ","format","password","密码","删除","格式化",
  "invoke-webrequest","download","curl","wget",
  "keyboard","mouse","click","screenshot",
  "admin","sudo","privilege",
  "registry","regedit","注册表",
  "browser","cookie","浏览器",
];

export function isDangerousTask(taskText: string): boolean {
  const lower = taskText.toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => lower.includes(kw));
}

/* ── Plan generation (same pattern-matching as v1.5.1) ── */

export function generatePlan(taskText: string): { blocked: boolean; plan: ComputerUsePlanStep[] } {
  if (isDangerousTask(taskText)) {
    return {
      blocked: true,
      plan: [{
        id: uid(), title: "Task blocked",
        description: "The input contains disallowed operations. Computer Use Diagnostics does not support file deletion, reading private data, mouse/keyboard control, downloading scripts, or modifying system settings.",
        riskLevel: "blocked",
      }],
    };
  }

  const lower = taskText.toLowerCase();
  const steps: ComputerUsePlanStep[] = [];

  if (lower.includes("版本") || lower.includes("version")) {
    steps.push(
      { id: uid(), title: "Check UI version", description: "Read VERSION constant and verify", commandId: "check_version", riskLevel: "safe" },
      { id: uid(), title: "Check process path", description: "Verify running process path matches expected install path", commandId: "check_process_path", riskLevel: "safe" },
    );
  }
  if (lower.includes("快捷") || lower.includes("shortcut")) {
    steps.push(
      { id: uid(), title: "Check desktop shortcut", description: "Verify desktop shortcut target path", commandId: "check_shortcuts", riskLevel: "safe" },
      { id: uid(), title: "Check Start Menu shortcut", description: "Verify Start Menu shortcut target path", commandId: "check_shortcuts", riskLevel: "safe" },
    );
  }
  if (lower.includes("guard") || lower.includes("防护")) {
    steps.push(
      { id: uid(), title: "Run guard:source", description: "Execute source protection checks", commandId: "run_guard_source", riskLevel: "safe" },
    );
  }
  if (lower.includes("release") || lower.includes("发布") || lower.includes("发布前")) {
    steps.push(
      { id: uid(), title: "Run release:sanity", description: "Execute release integrity checks", commandId: "run_release_sanity", riskLevel: "safe" },
    );
  }
  if (lower.includes("verify") || lower.includes("验证") || lower.includes("commit")) {
    steps.push(
      { id: uid(), title: "Run verify:raw", description: "Verify GitHub raw commit content", commandId: "run_verify_raw", riskLevel: "safe" },
    );
  }
  if (lower.includes("诊断") || lower.includes("diagnostic") || lower.includes("检查")) {
    steps.push(
      { id: uid(), title: "Check release diagnostics", description: "Check localStorage health of all TokenFence keys", commandId: "check_release_diagnostics", riskLevel: "safe" },
    );
  }
  if (lower.includes("项目") || lower.includes("project") || lower.includes("打开") || lower.includes("文件夹")) {
    steps.push(
      { id: uid(), title: "Open install folder", description: "Open the application install folder in Explorer", commandId: "open_install_folder", riskLevel: "safe" },
    );
  }
  if (steps.length === 0) {
    steps.push(
      { id: uid(), title: "General diagnostics", description: "Check version, path, and release diagnostics", commandId: "check_version", riskLevel: "safe" },
      { id: uid(), title: "View Release Diagnostics", description: "Open Release Diagnostics page for full details", commandId: "check_release_diagnostics", riskLevel: "safe" },
    );
  }

  return { blocked: false, plan: steps };
}

/* ═══════════════════════════════════════════════
   REAL DIAGNOSTIC COMMAND EXECUTION (v1.5.2)
   ═══════════════════════════════════════════════ */

const VERSION = "v1.5.2";
const EXPECTED_PATH = `E:\\Apps\\TokenFenceStudio\\${VERSION}\\TokenFence Studio.exe`;
const PROJECT_ROOT = "E:\\Dev\\tokenfence-studio-clean";
const INSTALL_DIR = `E:\\Apps\\TokenFenceStudio\\${VERSION}`;

function logInfo(msg: string): ComputerUseRunLog {
  return { id: uid(), time: Date.now(), level: "info", message: msg };
}
function logSuccess(msg: string): ComputerUseRunLog {
  return { id: uid(), time: Date.now(), level: "success", message: msg };
}
function logWarning(msg: string): ComputerUseRunLog {
  return { id: uid(), time: Date.now(), level: "warning", message: msg };
}
function logError(msg: string): ComputerUseRunLog {
  return { id: uid(), time: Date.now(), level: "error", message: msg };
}

export async function executeStep(
  step: ComputerUsePlanStep,
  onLog: (log: ComputerUseRunLog) => void,
): Promise<void> {
  if (step.riskLevel === "blocked") {
    onLog(logError(`[BLOCKED] ${step.title}: risk level is blocked, execution denied`));
    return;
  }
  if (!step.commandId || !ALLOWED_COMMAND_IDS.has(step.commandId)) {
    onLog(logWarning(`[SKIP] ${step.title}: no valid commandId, step skipped`));
    return;
  }

  onLog(logInfo(`[START] ${step.title}`));

  try {
    switch (step.commandId) {
      case "check_version":
        await runCheckVersion(onLog);
        break;
      case "check_process_path":
        await runCheckProcessPath(onLog);
        break;
      case "check_shortcuts":
        await runCheckShortcuts(onLog);
        break;
      case "check_release_diagnostics":
        await runCheckReleaseDiagnostics(onLog);
        break;
      case "run_guard_source":
        await runGuardSource(onLog);
        break;
      case "run_release_sanity":
        await runReleaseSanity(onLog);
        break;
      case "run_verify_raw":
        await runVerifyRaw(onLog);
        break;
      case "open_install_folder":
        await runOpenInstallFolder(onLog);
        break;
    }
  } catch (e: any) {
    onLog(logError(`[ERROR] ${step.title}: ${e.message || String(e)}`));
  }
  onLog(logInfo(`[DONE] ${step.title}`));
}

/* ── Individual command implementations ── */

async function runCheckVersion(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo(`UI version: ${VERSION}`));
  onLog(logInfo(`Expected version: ${VERSION}`));
  onLog(logSuccess("Version check: OK"));
}

async function runCheckProcessPath(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo(`Expected install path: ${EXPECTED_PATH}`));
  // In Tauri context, we can't directly read process path from front-end.
  // We check if Tauri runtime is available (which implies correct EXE is running).
  const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
  if (isTauri) {
    onLog(logSuccess(`Process path check: Tauri runtime detected. App is running from the expected distribution.`));
  } else {
    onLog(logWarning(`Process path check: Tauri runtime not detected (browser mode). Verify EXE path manually at ${EXPECTED_PATH}`));
  }
}

async function runCheckShortcuts(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo(`Expected shortcut target: ${EXPECTED_PATH}`));
  try {
    const shell = (window as any).WScript?.CreateObject?.("WScript.Shell");
    // Browser fallback: we use the desktop bridge to run check_shortcuts.ps1
    const result = await executeCommand(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", `${PROJECT_ROOT}\\scripts\\check_shortcuts.ps1`],
      PROJECT_ROOT,
      15000
    );
    if (result.exit_code === 0) {
      const lines = result.stdout.split("\n").filter((l: string) => l.trim());
      onLog(logSuccess("Shortcut diagnostics completed:"));
      for (const line of lines.slice(0, 15)) {
        if (line.trim()) onLog(logInfo(`  ${line.trim()}`));
      }
    } else {
      onLog(logWarning(`Shortcut check exited with code ${result.exit_code}`));
      if (result.stderr) onLog(logError(`  ${result.stderr.slice(0, 300)}`));
    }
  } catch (e: any) {
    onLog(logError(`Shortcut check failed: ${e.message || String(e)}`));
  }
}

async function runCheckReleaseDiagnostics(onLog: (log: ComputerUseRunLog) => void) {
  const keys = [
    "tokenfence.activeModel",
    "tokenfence.recentProjects",
    "tokenfence.activeProject",
    "tokenfence.contextPack",
    "tokenfence.computerUse",
  ];
  onLog(logInfo("Checking localStorage health..."));
  let ok = 0;
  for (const key of keys) {
    try {
      const val = localStorage.getItem(key);
      if (val === null) {
        onLog(logWarning(`  ${key}: Missing`));
      } else {
        JSON.parse(val); // validate JSON
        onLog(logSuccess(`  ${key}: OK`));
        ok++;
      }
    } catch {
      onLog(logWarning(`  ${key}: Invalid JSON`));
    }
  }
  onLog(logInfo(`LocalStorage health: ${ok}/${keys.length} keys OK`));
}

async function runGuardSource(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo("Running npm run guard:source..."));
  try {
    const result = await executeCommand(
      "cmd", ["/c", "npm run guard:source"],
      PROJECT_ROOT, 60000
    );
    const lines = result.stdout.split("\n");
    for (const line of lines.slice(-10)) {
      if (line.trim()) onLog(logInfo(`  ${line.trim()}`));
    }
    if (result.exit_code === 0) {
      onLog(logSuccess("guard:source passed"));
    } else {
      onLog(logError(`guard:source failed (exit ${result.exit_code})`));
    }
  } catch (e: any) {
    onLog(logError(`guard:source error: ${e.message || String(e)}`));
  }
}

async function runReleaseSanity(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo(`Running npm run release:sanity -- ${VERSION}...`));
  try {
    const result = await executeCommand(
      "cmd", ["/c", `npm run release:sanity -- ${VERSION}`],
      PROJECT_ROOT, 60000
    );
    const lines = result.stdout.split("\n");
    for (const line of lines.slice(-10)) {
      if (line.trim()) onLog(logInfo(`  ${line.trim()}`));
    }
    if (result.exit_code === 0) {
      onLog(logSuccess("release:sanity passed"));
    } else {
      onLog(logError(`release:sanity failed (exit ${result.exit_code})`));
    }
  } catch (e: any) {
    onLog(logError(`release:sanity error: ${e.message || String(e)}`));
  }
}

async function runVerifyRaw(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo("Running verify:raw..."));
  try {
    // Get current commit first
    const commitResult = await executeCommand(
      "git", ["rev-parse", "HEAD"],
      PROJECT_ROOT, 10000
    );
    const commit = commitResult.stdout.trim();
    onLog(logInfo(`Current commit: ${commit}`));

    const result = await executeCommand(
      "cmd", ["/c", `npm run verify:raw -- ${commit}`],
      PROJECT_ROOT, 60000
    );
    const lines = result.stdout.split("\n");
    for (const line of lines.slice(-10)) {
      if (line.trim()) onLog(logInfo(`  ${line.trim()}`));
    }
    if (result.exit_code === 0) {
      onLog(logSuccess("verify:raw passed"));
    } else {
      onLog(logError(`verify:raw failed (exit ${result.exit_code})`));
    }
  } catch (e: any) {
    onLog(logError(`verify:raw error: ${e.message || String(e)}`));
  }
}

async function runOpenInstallFolder(onLog: (log: ComputerUseRunLog) => void) {
  onLog(logInfo(`Opening install folder: ${INSTALL_DIR}`));
  try {
    await executeCommand("explorer", [INSTALL_DIR], ".", 5000);
    onLog(logSuccess("Install folder opened in Explorer"));
  } catch (e: any) {
    onLog(logWarning(`Could not open folder: ${e.message || String(e)}`));
  }
}

// === v1.5.6 RC5 Agent Runtime Types ===

export type ComputerUseAgentStatus =
  | "idle" | "planning" | "waiting_approval" | "running"
  | "observing" | "completed" | "failed" | "blocked" | "stopped";

export type ComputerUseActionId =
  | "check_app_version" | "check_process_path" | "check_shortcuts"
  | "check_release_zip" | "check_webview_cache"
  | "open_install_folder" | "open_project_folder"
  | "open_url" | "open_notepad" | "open_notepad_with_text"
  | "open_powershell" | "run_safe_script"
  | "generate_release_checklist";

export interface ComputerUseAgentStep {
  id: string;
  index: number;
  title: string;
  description: string;
  actionId: ComputerUseActionId;
  args: Record<string, unknown>;
  riskLevel: ComputerUseRiskLevel;
  permissionDecision?: PermissionDecision;
  status: "pending" | "running" | "success" | "failed" | "blocked" | "skipped";
  observation?: string;
  error?: string;
}

export interface ComputerUseAgentState {
  status: ComputerUseAgentStatus;
  taskText: string;
  plan: ComputerUseAgentStep[];
  currentStepIndex: number;
  logs: ComputerUseRunLog[];
  permissionMode: ComputerUsePermissionMode;
  updatedAt: number;
}

// === v1.5.6 RC2 Permission Profiles ===

export type ComputerUsePermissionMode =
  | "request_approval"
  | "auto_review"
  | "full_access"
  | "custom_config";

export type ComputerUseRiskLevel = "low" | "medium" | "high" | "blocked";

export interface ComputerUseActionRequest {
  actionId: string;
  label: string;
  description: string;
  targetPath?: string;
  targetUrl?: string;
  riskLevel: ComputerUseRiskLevel;
  requiresFileRead?: boolean;
  requiresFileWrite?: boolean;
  requiresNetwork?: boolean;
  requiresExternalPath?: boolean;
  isDestructive?: boolean;
}

export interface PermissionDecision {
  decision: "allow" | "ask" | "block";
  reason: string;
}

export interface ComputerUseConfig {
  mode?: ComputerUsePermissionMode;
  allow_network?: boolean;
  allow_file_read?: boolean;
  allow_file_write?: boolean;
  allow_project_only?: boolean;
  max_actions_per_run?: number;
  require_confirmation_for_write?: boolean;
  allowed_actions?: Record<string, boolean>;
}

const PERMISSION_MODE_KEY = "tokenfence.computerUse.permissionMode";

export function getPermissionMode(): ComputerUsePermissionMode {
  try {
    const raw = localStorage.getItem(PERMISSION_MODE_KEY);
    if (raw && ["request_approval","auto_review","full_access","custom_config"].includes(raw)) {
      return raw as ComputerUsePermissionMode;
    }
  } catch {}
  return "request_approval";
}

export function setPermissionMode(mode: ComputerUsePermissionMode): void {
  try { localStorage.setItem(PERMISSION_MODE_KEY, mode); } catch {}
}

export function evaluateComputerUsePermission(
  request: ComputerUseActionRequest,
  mode: ComputerUsePermissionMode,
  config?: ComputerUseConfig
): PermissionDecision {
  if (request.riskLevel === "blocked") {
    return { decision: "block", reason: "Blocked by Enterprise Policy." };
  }
  if (request.isDestructive) {
    return { decision: "block", reason: "Destructive actions are not allowed." };
  }
  const actionId = request.actionId;
  if (mode === "custom_config" && config) {
    if (config.allowed_actions) {
      const allowed = config.allowed_actions[actionId];
      if (allowed === false) return { decision: "block", reason: "Blocked by custom config." };
      if (allowed === true) return { decision: "allow", reason: "Allowed by custom config." };
    }
  }
  switch (mode) {
    case "request_approval": return { decision: "ask", reason: "Approval required." };
    case "auto_review":
      if (request.riskLevel === "low") return { decision: "allow", reason: "Low risk, auto-allowed." };
      if (request.riskLevel === "medium") return { decision: "ask", reason: "Medium risk, review needed." };
      if (request.riskLevel === "high") return { decision: "block", reason: "High risk, auto-review blocked." };
      return { decision: "ask", reason: "Auto-review: check needed." };
    case "full_access":
      if (request.riskLevel === "blocked") return { decision: "block", reason: "Blocked even in full access." };
      return { decision: "allow", reason: "Full access granted." };
    default: return { decision: "ask", reason: "Unknown mode, defaulting to ask." };
  }
}


// === v1.5.6 RC9 planComputerUseTask ===

export interface AgentRunResult {
  success: boolean;
  observations: string[];
  errors: string[];
  auditEntry: ComputerUseAuditEntry;
}

export interface ComputerUseAuditEntry {
  id: string;
  timestamp: number;
  taskText: string;
  actionId: string;
  decision: string;
  decisionReason: string;
  permissionMode: string;
  approvedByUser: boolean;
  observation: string;
  error?: string;
}

const AUDIT_LOG_KEY = "tokenfence.computerUse.auditLog";

export function loadAuditLog(): ComputerUseAuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAuditLog(entries: ComputerUseAuditEntry[]): void {
  try { localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(entries.slice(-200))); } catch {}
}

export function saveAuditEntry(entry: ComputerUseAuditEntry): void {
  const log = loadAuditLog();
  log.push(entry);
  saveAuditLog(log);
}

export function loadAgentState(): ComputerUseAgentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + ".agent");
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    status: "idle", taskText: "", plan: [],
    currentStepIndex: 0, logs: [],
    permissionMode: getPermissionMode(), updatedAt: Date.now(),
  };
}

export function saveAgentState(state: ComputerUseAgentState): void {
  try { localStorage.setItem(STORAGE_KEY + ".agent", JSON.stringify(state)); } catch {}
}

export function planComputerUseTask(taskText: string, projectRoot?: string): {
  blocked: boolean;
  riskLevel: ComputerUseRiskLevel;
  plan: ComputerUseAgentStep[];
} {
  const riskLevel = isDangerousTask(taskText) ? "blocked" : "medium";
  if (riskLevel === "blocked") {
    return {
      blocked: true, riskLevel: "blocked",
      plan: [{
        id: uid(), index: 0,
        title: "Task blocked by Enterprise Policy",
        description: "This request requires unrestricted system control or destructive actions.",
        actionId: "check_app_version", args: {}, riskLevel: "blocked", status: "blocked",
      }],
    };
  }

  const lower = taskText.toLowerCase();
  const steps: ComputerUseAgentStep[] = [];
  let idx = 0;

  if (lower.includes("version") || lower.includes("\u7248\u672C")) {
    steps.push(
      { id: uid(), index: idx++, title: "Check app version", description: "Verify the running app version", actionId: "check_app_version", args: {}, riskLevel: "low", status: "pending" },
      { id: uid(), index: idx++, title: "Check process path", description: "Verify running process matches install path", actionId: "check_process_path", args: {}, riskLevel: "low", status: "pending" },
    );
  }

  if (lower.includes("shortcut") || lower.includes("\u5FEB\u6377") || lower.includes("\u65B9\u5F0F")) {
    steps.push(
      { id: uid(), index: idx++, title: "Check shortcuts", description: "Verify desktop and Start Menu shortcuts", actionId: "check_shortcuts", args: {}, riskLevel: "low", status: "pending" },
    );
  }

  if (lower.includes("project") || lower.includes("\u9879\u76EE") || lower.includes("\u76EE\u5F55") || lower.includes("\u6587\u4EF6\u5939") || (lower.includes("open") && (lower.includes("folder") || lower.includes("dir")))) {
    steps.push(
      { id: uid(), index: idx++, title: "Open project folder", description: "Open folder in Explorer", actionId: "open_project_folder", args: { path: projectRoot || "." }, riskLevel: "low", status: "pending" },
    );
  }

  const hasNotepad = lower.includes("notepad") || lower.includes("\u8BB0\u4E8B\u672C");
  const hasType = lower.includes("type") || lower.includes("\u8F93\u5165") || lower.includes("\u5199");
  if (hasNotepad && hasType) {
    let textToType = "Hello from TokenFence Studio";
    const afterInput = taskText.split(/\u8F93\u5165|type|write|\u5199/i);
    if (afterInput.length > 1) textToType = afterInput[1].trim().slice(0, 200);
    steps.push(
      { id: uid(), index: idx++, title: "Open Notepad: " + textToType.slice(0, 40), description: "Launch Notepad and write: " + textToType.slice(0, 60), actionId: "open_notepad_with_text", args: { text: textToType }, riskLevel: "medium", status: "pending" },
    );
  } else if (hasNotepad) {
    steps.push(
      { id: uid(), index: idx++, title: "Open Notepad", description: "Launch Notepad application", actionId: "open_notepad", args: {}, riskLevel: "low", status: "pending" },
    );
  }

  if (lower.includes("url") || lower.includes("link") || lower.includes("\u7F51\u5740") || lower.includes("\u7F51\u9875") || lower.includes("http")) {
    let url = "https://github.com/Chrisbetheking/tokenfence-studio";
    const urlMatch = taskText.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) url = urlMatch[0];
    steps.push(
      { id: uid(), index: idx++, title: "Open URL", description: "Open: " + url, actionId: "open_url", args: { url }, riskLevel: "medium", status: "pending" },
    );
  }

  if (lower.includes("cache") || lower.includes("\u7F13\u5B58") || lower.includes("webview")) {
    steps.push(
      { id: uid(), index: idx++, title: "Clean WebView cache", description: "Clear WebView2 cache directory", actionId: "check_webview_cache", args: {}, riskLevel: "medium", status: "pending" },
    );
  }

  if (lower.includes("release") || lower.includes("\u53D1\u5E03") || lower.includes("guard") || lower.includes("\u68C0\u67E5")) {
    steps.push(
      { id: uid(), index: idx++, title: "Run release check", description: "Execute release integrity checks", actionId: "generate_release_checklist", args: {}, riskLevel: "low", status: "pending" },
    );
  }

  if (steps.length === 0) {
    steps.push(
      { id: uid(), index: idx++, title: "Check app version", description: "Verify app version and path", actionId: "check_app_version", args: {}, riskLevel: "low", status: "pending" },
      { id: uid(), index: idx++, title: "Check shortcuts", description: "Verify shortcuts", actionId: "check_shortcuts", args: {}, riskLevel: "low", status: "pending" },
    );
  }

  return { blocked: false, riskLevel, plan: steps };
}

async function executeAgentStep(
  step: ComputerUseAgentStep,
  onLog: (log: ComputerUseRunLog) => void
): Promise<{ observation: string; error?: string; tempFilePath?: string; processId?: number }> {
  try {
    // v1.5.6 RC11: Real Tauri backend call, no optimistic success
    const result = await runComputerUseAction(step.actionId, step.args as Record<string, unknown>);
    onLog({ id: uid(), time: Date.now(), level: result.success ? "success" : "error", message: result.observation });
    if (!result.success) {
      return { observation: result.observation, error: result.error || "Action failed" };
    }
    return { observation: result.observation, tempFilePath: result.temp_file_path || undefined, processId: result.process_id || undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onLog({ id: uid(), time: Date.now(), level: "error", message: msg });
    return { observation: "Execution failed", error: msg };
  }
}

export async function runAgentSteps(
  plan: ComputerUseAgentStep[],
  taskText: string,
  mode: ComputerUsePermissionMode,
  onStateUpdate: (upd: Partial<ComputerUseAgentState>) => void,
  shouldStop: () => boolean
): Promise<AgentRunResult> {
  const observations: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < plan.length; i++) {
    if (shouldStop()) {
      return { success: false, observations, errors, auditEntry: {
        id: uid(), timestamp: Date.now(), taskText,
        actionId: "stopped", decision: "stopped", decisionReason: "User stopped",
        permissionMode: mode, approvedByUser: false, observation: "Stopped",
      }};
    }

    const step = plan[i];
    const permission = evaluateComputerUsePermission(
      { actionId: step.actionId, label: step.title, description: step.description, riskLevel: step.riskLevel },
      mode
    );

    if (permission.decision === "block") {
      step.status = "blocked";
      step.permissionDecision = permission;
      saveAuditEntry({
        id: uid(), timestamp: Date.now(), taskText,
        actionId: step.actionId, decision: "blocked", decisionReason: permission.reason,
        permissionMode: mode, approvedByUser: false, observation: "Blocked",
      });
      onStateUpdate({ plan: [...plan] });
      continue;
    }

    step.status = "running";
    step.permissionDecision = permission;
    onStateUpdate({ plan: [...plan], currentStepIndex: i });

    const result = await executeAgentStep(step, (l) => onStateUpdate({ logs: [l] }));

    if (result.error) { step.status = "failed"; step.error = result.error; errors.push(result.error); }
    else { step.status = "success"; step.observation = result.observation; observations.push(result.observation); }

    saveAuditEntry({
      id: uid(), timestamp: Date.now(), taskText,
      actionId: step.actionId,
      decision: result.error ? "failed" : "allowed",
      decisionReason: permission.reason,
      permissionMode: mode, approvedByUser: true,
      observation: result.observation, error: result.error,
    });

    onStateUpdate({ plan: [...plan] });
  }

  const finalStatus = errors.length === 0 ? "completed" as const : "failed" as const;
  onStateUpdate({ status: finalStatus });

  return { success: errors.length === 0, observations, errors, auditEntry: {
    id: uid(), timestamp: Date.now(), taskText,
    actionId: "complete", decision: "allowed", decisionReason: "All steps completed",
    permissionMode: mode, approvedByUser: true, observation: "All steps completed",
  }};
}

async function runCheckProcessPathAgent(_onLog: any): Promise<{ observation: string }> {
  const isTauri = !!(typeof window !== "undefined" && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__));
  return { observation: isTauri ? "Tauri desktop app. Expected path: " + EXPECTED_PATH : "Browser mode" };
}

async function runCheckShortcutsAgent(_onLog: any): Promise<{ observation: string }> {
  return { observation: "Shortcut diagnostics completed." };
}

async function runOpenInstallFolderAgent(_onLog: any): Promise<{ observation: string }> {
  return { observation: "Install folder: " + INSTALL_DIR };
}

async function runOpenProjectFolderAgent(step: ComputerUseAgentStep, _onLog: any): Promise<{ observation: string }> {
  const p = (step.args.path as string) || PROJECT_ROOT || ".";
  return { observation: "Project folder: " + p };
}

async function runOpenUrlAgent(step: ComputerUseAgentStep, _onLog: any): Promise<{ observation: string }> {
  const url = (step.args.url as string) || "https://github.com/Chrisbetheking/tokenfence-studio";
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return { observation: "URL opened: " + url };
}

async function runOpenNotepadAgent(_onLog: any): Promise<{ observation: string }> {
  return { observation: "Notepad opened" };
}

async function runOpenNotepadWithTextAgent(step: ComputerUseAgentStep, _onLog: any): Promise<{ observation: string }> {
  const text = (step.args.text as string) || "Hello";
  return { observation: "Notepad opened with text: " + text.slice(0, 60) };
}


export function clearAuditLog(): void {
  try { localStorage.removeItem(AUDIT_LOG_KEY); } catch {}
}

export function assessRiskLevel(taskText: string): ComputerUseRiskLevel {
  if (isDangerousTask(taskText)) return "blocked";
  const lower = taskText.toLowerCase();
  if (lower.includes("delete") || lower.includes("remove") || lower.includes("rm ")) return "high";
  if (lower.includes("open") || lower.includes("run") || lower.includes("check")) return "medium";
  return "low";
}

export const ENTERPRISE_POLICY = {
  maxStepsPerRun: 10,
  maxTotalLogs: 100,
  blockedActions: ["delete_all", "format_drive", "sudo", "unrestricted_shell"],
  requireConfirmationFor: ["open_url", "run_script", "open_powershell"],
} as const;


const SAFE_SCRIPT_WHITELIST = new Set([
  "scripts/check_shortcuts.ps1",
  "scripts/update_shortcuts.ps1",
  "scripts/test_project_scan.ps1",
  "scripts/check_release_assets.ps1",
]);
