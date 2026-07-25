const STORAGE_KEY = "tokenfence.contextPack";
const MAX_FILES = 50;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ContextPackFile {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
  fileType: string;
  addedAt: number;
  isLarge: boolean;
}

export interface ContextPackState {
  activeProjectPath: string | null;
  files: ContextPackFile[];
  updatedAt: number;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyState(): ContextPackState {
  return { activeProjectPath: null, files: [], updatedAt: Date.now() };
}

export function loadContextPack(): ContextPackState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      activeProjectPath: typeof parsed.activeProjectPath === "string" ? parsed.activeProjectPath : null,
      files: Array.isArray(parsed.files) ? parsed.files : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return emptyState();
  }
}

export function saveContextPack(state: ContextPackState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // localStorage full or unavailable
  }
}

export function addFilesToContextPack(newFiles: ContextPackFile[]): ContextPackState {
  const state = loadContextPack();
  const existingPaths = new Set(state.files.map(f => f.path));
  const now = Date.now();

  for (const f of newFiles) {
    if (state.files.length >= MAX_FILES) break;
    if (existingPaths.has(f.path)) continue; // no duplicates
    const isLarge = f.sizeBytes > MAX_FILE_SIZE_BYTES;
    state.files.push({
      id: uid(),
      name: f.name,
      path: f.path,
      relativePath: f.relativePath,
      sizeBytes: f.sizeBytes,
      fileType: f.fileType,
      addedAt: now,
      isLarge,
    });
    existingPaths.add(f.path);
  }

  state.updatedAt = now;
  saveContextPack(state);
  return state;
}

export function removeFileFromContextPack(fileId: string): ContextPackState {
  const state = loadContextPack();
  state.files = state.files.filter(f => f.id !== fileId);
  state.updatedAt = Date.now();
  saveContextPack(state);
  return state;
}

export function clearContextPack(): ContextPackState {
  const state = emptyState();
  saveContextPack(state);
  return state;
}

export function getContextPackSummary(): string {
  const state = loadContextPack();
  if (state.files.length === 0) return "";
  const names = state.files.map(f => f.name).join(", ");
  const totalSize = state.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const sizeStr = totalSize < 1024 ? totalSize + " B"
    : totalSize < 1024 * 1024 ? (totalSize / 1024).toFixed(1) + " KB"
    : (totalSize / (1024 * 1024)).toFixed(1) + " MB";
  return "[Context Pack: " + state.files.length + " files, " + sizeStr + "] " + names;
}
