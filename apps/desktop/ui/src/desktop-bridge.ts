import type { ProjectFileNode } from './data/project-file-tree';
// Desktop bridge: invokes Tauri commands for file I/O and command execution
// Uses @tauri-apps/api/tauri invoke (Tauri v1)

import { invoke } from "@tauri-apps/api/tauri";

export async function pingTauri(): Promise<string> {
  return await invoke<string>("ping_tauri");
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
  try {
    return await invoke<CommandResult>("execute_command", { command, args: args ?? [], cwd: cwd ?? ".", timeoutMs: timeoutMs ?? 30000 });
  } catch {
    return { exit_code: -1, stdout: "", stderr: "Desktop command bridge failed", killed: false, duration_ms: 0 };
  }
}

export async function writeFile(path: string, content: string): Promise<string> {
  try { return await invoke<string>("write_file", { path, content }); } catch { return path; }
}

export async function readFile(path: string): Promise<string> {
  try { return await invoke<string>("read_file", { path }); } catch { return ""; }
}

export async function fileExists(path: string): Promise<FileInfo> {
  try { return await invoke<FileInfo>("file_exists", { path }); } catch { return { path, exists: false, size: 0, is_dir: false }; }
}

export async function createDirectory(path: string): Promise<string> {
  try { return await invoke<string>("create_directory", { path }); } catch { return path; }
}

export async function listDirectory(path: string): Promise<FileInfo[]> {
  try { return await invoke<FileInfo[]>("list_directory", { path }); } catch { return []; }
}

export async function initTokenfenceDirs(basePath: string): Promise<string> {
  try { return await invoke<string>("init_tokenfence_dirs", { basePath }); } catch { return basePath; }
}

export async function isTauri(): Promise<boolean> {
  try { await invoke<string>("ping_tauri"); return true; } catch { return false; }
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
  timestamp?: number;
}

export async function createBackup(filePath: string): Promise<BackupResult> {
  try { return await invoke<BackupResult>("create_backup", { filePath }); } catch { return { original_path: filePath, backup_path: "", timestamp: 0 }; }
}

export async function applyPatch(filePath: string, newContent: string, createBackupBefore?: boolean): Promise<PatchResult> {
  try { return await invoke<PatchResult>("apply_patch", { filePath, newContent, createBackupBefore }); } catch { return { file_path: filePath, success: false, error: "Desktop bridge unavailable" }; }
}

export async function undoLastPatch(filePath: string): Promise<PatchResult> {
  try { return await invoke<PatchResult>("undo_last_patch", { filePath }); } catch { return { file_path: filePath, success: false, error: "Desktop bridge unavailable" }; }
}

export async function appendOperationLog(operation: string, files: string[], success: boolean, error?: string): Promise<string> {
  try { return await invoke<string>("append_operation_log", { operation, files, success, error }); } catch { return ""; }
}

// ── Project Scan ──────────────────────────────────────────────────────

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

export interface ProjectScanResult {
  nodes: ProjectFileNode[];
  debug: ProjectScanDebug;
}

function emptyScanDebug(path: string, error: string): ProjectScanDebug {
  return { path, exists: false, isDir: false, readDirCount: 0, returnedTopNodes: 0, returnedFlatNodes: 0, returnedFiles: 0, returnedDirs: 0, firstEntries: [], firstNodes: [], error };
}

export async function scanProjectDirectory(projectPath: string): Promise<ProjectScanResult> {
  const normalizedPath = projectPath.trim();
  if (!normalizedPath) {
    return { nodes: [], debug: emptyScanDebug(normalizedPath, "Project path is empty.") };
  }

  try {
    const result = await invoke<ProjectScanResult>("scan_project_directory", { projectPath: normalizedPath });
    if (!result || !Array.isArray(result.nodes)) {
      return { nodes: [], debug: emptyScanDebug(normalizedPath, "scan_project_directory returned invalid result shape.") };
    }
    // Normalize Rust snake_case field names to front-end camelCase (recursive)
    function normalizeNode(entry: any): ProjectFileNode {
      return {
        id: entry.id ?? entry.name,
        name: entry.name,
        path: entry.path,
        relativePath: entry.relativePath ?? entry.relative_path ?? entry.name,
        type: (entry.type ?? entry.entry_type ?? entry.node_type ?? 'file') as 'file' | 'directory',
        sizeBytes: entry.sizeBytes ?? entry.size_bytes,
        fileType: entry.fileType ?? entry.file_type,
        children: entry.children ? entry.children.map(normalizeNode) : undefined,
      };
    }
    const nodes: ProjectFileNode[] = result.nodes.map(normalizeNode);
    return { nodes, debug: result.debug };
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e);
    return { nodes: [], debug: emptyScanDebug(normalizedPath, "Tauri invoke failed: " + message) };
  }
}

export function getScanBridgeStatus(error?: string | null): string {
  if (error) return "Bridge failed";
  return "Desktop/Tauri";
}

export async function openLogsFolder(): Promise<void> {
  try {
    const logsDir = "E:\\Dev\\tokenfence-studio-final\\.tokenfence\\logs";
    await invoke("execute_command", { command: "explorer", args: [logsDir], cwd: ".", timeoutMs: 5000 });
  } catch {}
}
/* === v1.5.6 RC5 Computer Use Agent === */

export interface ComputerUseActionResult {
  action_id: string;
  success: boolean;
  observation: string;
  error?: string | null;
  temp_file_path?: string | null;
  process_id?: number | null;
}

export async function runComputerUseAction(actionId: string, args?: Record<string, unknown>): Promise<ComputerUseActionResult> {
  try {
    const result = await invoke<ComputerUseActionResult>("run_computer_use_action", {
      actionId,
      args: args || {},
    });
    return result;
  } catch (e: any) {
    return {
      action_id: actionId,
      success: false,
      observation: "Tauri invoke failed: " + (e.message || String(e)),
      error: e.message || String(e),
      temp_file_path: null,
      process_id: null,
    };
  }
}
