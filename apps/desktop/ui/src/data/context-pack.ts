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

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Validate one persisted context-pack entry.
 *
 * The list is read back from storage, so it must be treated as untrusted. A
 * `null`, a bare string or an entry without a path used to reach the rest of
 * the module verbatim: `addFilesToContextPack` then threw on
 * `entry.path`, `removeFileFromContextPack` threw on `entry.id`, and a
 * non-numeric `sizeBytes` rendered the pack size as `NaN MB`.
 */
function normalizeFile(entry: unknown): ContextPackFile | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const row = entry as Record<string, unknown>;
  const path = text(row.path);
  if (!path) return undefined;
  const size = Number(row.sizeBytes);
  const addedAt = Number(row.addedAt);
  const sizeBytes = Number.isFinite(size) && size >= 0 ? Math.floor(size) : 0;
  return {
    id: text(row.id) ?? uid(),
    name: text(row.name) ?? path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    path,
    relativePath: text(row.relativePath) ?? path,
    sizeBytes,
    fileType: text(row.fileType) ?? "unknown",
    addedAt: Number.isFinite(addedAt) ? addedAt : Date.now(),
    // Recomputed rather than trusted, so the flag always matches the size.
    isLarge: sizeBytes > MAX_FILE_SIZE_BYTES,
  };
}

export function loadContextPack(): ContextPackState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    const files = Array.isArray(parsed.files)
      ? parsed.files
          .map(normalizeFile)
          .filter((entry: ContextPackFile | undefined): entry is ContextPackFile => Boolean(entry))
          // The cap must hold for restored data too: it used to be enforced only
          // while adding, so a larger stored list stayed over the limit forever.
          .slice(0, MAX_FILES)
      : [];
    return {
      activeProjectPath: typeof parsed.activeProjectPath === "string" ? parsed.activeProjectPath : null,
      files,
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
