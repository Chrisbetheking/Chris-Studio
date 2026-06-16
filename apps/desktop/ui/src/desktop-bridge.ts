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
