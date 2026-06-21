import type { ProjectFileNode } from './data/project-file-tree';
// Desktop bridge: invokes Tauri commands for file I/O and command execution
// Falls back to browser-safe stubs when not running inside Tauri

let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function getInvoke() {
  if (tauriInvoke) return tauriInvoke;

  // Priority 1: window.__TAURI__ global (set by Tauri v1 runtime)
  const g = (window as any).__TAURI__;
  const globalInvoke = g?.invoke || g?.tauri?.invoke;
  if (typeof globalInvoke === "function") {
    tauriInvoke = globalInvoke;
    return tauriInvoke;
  }

  // Priority 2: @tauri-apps/api npm package
  try {
    const mod = await import("@tauri-apps/api/core");
    if (typeof mod.invoke === "function") {
      tauriInvoke = mod.invoke;
      return tauriInvoke;
    }
  } catch { /* package not available */ }

  return null;
}

export interface CommandResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
  duration_ms: number;
}

export interface FileInfo {
  path: string;
  exists: boolean;
  size: number;
  is_dir: boolean;
}

export async function executeCommand(command: string, args?: string[], cwd?: string, timeoutMs?: number): Promise<CommandResult> {
  const invoke = await getInvoke();
  if (!invoke) {
    return { exit_code: -1, stdout: "", stderr: "Desktop command bridge failed: runtime unavailable or invoke command not registered.", killed: false, duration_ms: 0 };
  }
  return invoke("execute_command", { command, args: args ?? [], cwd: cwd ?? ".", timeoutMs: timeoutMs ?? 30000 }) as Promise<CommandResult>;
}

export async function writeFile(path: string, content: string): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) {
    console.warn("[desktop-bridge] writeFile not available outside Tauri");
    return path;
  }
  return invoke("write_file", { path, content }) as Promise<string>;
}

export async function readFile(path: string): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return "";
  return invoke("read_file", { path }) as Promise<string>;
}

export async function fileExists(path: string): Promise<FileInfo> {
  const invoke = await getInvoke();
  if (!invoke) return { path, exists: false, size: 0, is_dir: false };
  return invoke("file_exists", { path }) as Promise<FileInfo>;
}

export async function createDirectory(path: string): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return path;
  return invoke("create_directory", { path }) as Promise<string>;
}

export async function listDirectory(path: string): Promise<FileInfo[]> {
  const invoke = await getInvoke();
  if (!invoke) return [];
  return invoke("list_directory", { path }) as Promise<FileInfo[]>;
}

export async function initTokenfenceDirs(basePath: string): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return basePath;
  return invoke("init_tokenfence_dirs", { basePath }) as Promise<string>;
}

export async function isTauri(): Promise<boolean> {
  const invoke = await getInvoke();
  return invoke !== null;
}
export interface PatchResult {
  file_path: string;
  success: boolean;
  error?: string;
  backup_path?: string;
}

export interface BackupResult {
  original_path: string;
  backup_path: string;
  timestamp: number;
}

export async function createBackup(filePath: string): Promise<BackupResult> {
  const invoke = await getInvoke();
  if (!invoke) throw new Error("Desktop runtime unavailable");
  return invoke("create_backup", { filePath }) as Promise<BackupResult>;
}

export async function applyPatch(filePath: string, newContent: string, createBackupBefore?: boolean): Promise<PatchResult> {
  const invoke = await getInvoke();
  if (!invoke) throw new Error("Desktop runtime unavailable");
  return invoke("apply_patch", { filePath, newContent, createBackupBefore: createBackupBefore ?? true }) as Promise<PatchResult>;
}

export async function undoLastPatch(filePath: string): Promise<PatchResult> {
  const invoke = await getInvoke();
  if (!invoke) throw new Error("Desktop runtime unavailable");
  return invoke("undo_last_patch", { filePath }) as Promise<PatchResult>;
}

export async function appendOperationLog(operation: string, files: string[], success: boolean, error?: string): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return "";
  return invoke("append_operation_log", { operation, files, success, error }) as Promise<string>;
}


export async function scanProjectDirectory(projectPath: string): Promise<ProjectFileNode[]> {
  const invoke = await getInvoke();
  if (!invoke) {
    // Browser fallback: return empty array (caller should use buildMockFileTree)
    return [];
  }
  try {
    const result = await invoke("scan_project_directory", { projectPath }) as any[];
    return result.map(mapEntry);
  } catch (e: any) {
    console.error("scan_project_directory failed:", e);
    return [];
  }
}

function mapEntry(entry: any): ProjectFileNode {
  return {
    id: entry.id,
    name: entry.name,
    path: entry.path,
    relativePath: entry.relative_path || entry.relativePath || entry.name,
    type: entry.node_type || entry.type || "file",
    sizeBytes: entry.size_bytes ?? entry.sizeBytes,
    fileType: entry.file_type ?? entry.fileType,
    children: entry.children ? entry.children.map(mapEntry) : undefined,
  };
}
export async function openLogsFolder(): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  const logsDir = "E:\Dev\tokenfence-studio-final\.tokenfence\logs";
  await invoke("execute_command", { command: "explorer", args: [logsDir], cwd: ".", timeoutMs: 5000 });
}
