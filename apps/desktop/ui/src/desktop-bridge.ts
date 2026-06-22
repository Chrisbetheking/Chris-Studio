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


export interface ProjectScanResult {
  nodes: ProjectFileNode[];
  debug: ProjectScanDebug;
}

export interface ProjectScanDebug {
  path: string;
  exists: boolean;
  isDir: boolean;
  readDirCount: number;
  returnedTopNodes: number;
  returnedFlatNodes: number;
  returnedFiles: number;
  returnedDirs: number;
  firstEntries: string[];
  firstNodes: string[];
  error: string | null;
}

export async function scanProjectDirectory(projectPath: string): Promise<ProjectScanResult> {
  const emptyDebug: ProjectScanDebug = {
    path: projectPath, exists: false, isDir: false, readDirCount: 0,
    returnedTopNodes: 0, returnedFlatNodes: 0, returnedFiles: 0, returnedDirs: 0,
    firstEntries: [], firstNodes: [], error: null
  };

  let invokeFn: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

  // Try window.__TAURI__ (v1 style)
  const tauriGlobal = (window as any).__TAURI__;
  const gInvoke = tauriGlobal?.invoke || tauriGlobal?.tauri?.invoke || tauriGlobal?.core?.invoke;
  if (typeof gInvoke === "function") { invokeFn = gInvoke; }

  // Try @tauri-apps/api/core (v2 npm)
  if (!invokeFn) {
    try {
      const coreMod = await import("@tauri-apps/api/core");
      if (typeof coreMod.invoke === "function") { invokeFn = coreMod.invoke; }
    } catch {}
  }

  if (!invokeFn) {
    console.warn("[desktop-bridge] scanProjectDirectory: no Tauri invoke available");
    return { nodes: [], debug: { ...emptyDebug, error: "No Tauri invoke available" } };
  }

  try {
    const raw = await invokeFn("scan_project_directory", { projectPath }) as any;
    console.log("[desktop-bridge] scan raw result:", JSON.stringify(raw?.debug).substring(0, 300));

    if (!raw || !raw.nodes) {
      return { nodes: [], debug: { ...emptyDebug, error: "Unexpected result format: " + JSON.stringify(raw).substring(0, 200) } };
    }

    const nodes: ProjectFileNode[] = Array.isArray(raw.nodes) ? raw.nodes.map(mapEntry) : [];
    const dbg: any = raw.debug || {};

    return {
      nodes,
      debug: {
        path: dbg.path || projectPath,
        exists: !!dbg.exists,
        isDir: !!dbg.isDir,
        readDirCount: dbg.readDirCount ?? 0,
        returnedTopNodes: dbg.returnedTopNodes ?? 0,
        returnedFlatNodes: dbg.returnedFlatNodes ?? 0,
        returnedFiles: dbg.returnedFiles ?? 0,
        returnedDirs: dbg.returnedDirs ?? 0,
        firstEntries: dbg.firstEntries || [],
        firstNodes: dbg.firstNodes || [],
        error: dbg.error || null,
      }
    };
  } catch (e: any) {
    console.error("[desktop-bridge] scan threw:", e?.message ?? e);
    return { nodes: [], debug: { ...emptyDebug, error: e?.message || "Scan failed" } };
  }
}

function mapEntry(entry: any): ProjectFileNode {
  return {
    id: entry.id,
    name: entry.name,
    path: entry.path,
    relativePath: entry.relativePath ?? entry.relative_path ?? entry.name,
    type: entry.type ?? entry.entry_type ?? entry.node_type ?? "file",
    sizeBytes: entry.sizeBytes ?? entry.size_bytes,
    fileType: entry.fileType ?? entry.file_type,
    children: entry.children ? entry.children.map(mapEntry) : undefined,
  };
}
/** Check whether the Tauri invoke bridge is available for scan calls. */
export async function getScanBridgeStatus(): Promise<{ available: boolean; source: "tauri" | "browser" }> {
  const tauriGlobal = (window as any).__TAURI__;
  const gInvoke = tauriGlobal?.invoke || tauriGlobal?.tauri?.invoke || tauriGlobal?.core?.invoke;
  if (typeof gInvoke === "function") return { available: true, source: "tauri" };
  try {
    const coreMod = await import("@tauri-apps/api/core");
    if (typeof coreMod.invoke === "function") return { available: true, source: "tauri" };
  } catch {}
  return { available: false, source: "browser" };
}

export async function openLogsFolder(): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  const logsDir = "E:\Dev\tokenfence-studio-final\.tokenfence\logs";
  await invoke("execute_command", { command: "explorer", args: [logsDir], cwd: ".", timeoutMs: 5000 });
}