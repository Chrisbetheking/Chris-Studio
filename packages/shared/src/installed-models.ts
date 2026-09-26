/* ============================================================
   TokenFence Studio — Installed Models v1.2.3
   User-managed model library: add/remove/enable/disable
   Storage key: tokenfence.installedModels
   ============================================================ */

import { storeGet, storeSet } from "./agent-runtime/safeStorage";
import { MODEL_REGISTRY, type ModelRegistryItem, type ModelCapability } from "./model-registry";

export type InstalledModelSource = "registry" | "fetched" | "custom";

export interface InstalledModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  alias?: string;
  enabled: boolean;
  isDefault?: boolean;
  addedAt: number;
  lastUsedAt?: number;
  source: InstalledModelSource;
  customModelId?: string;
}

const STORAGE_KEY = "tokenfence.installedModels";

const VALID_SOURCES: ReadonlySet<string> = new Set(["registry", "fetched", "custom"]);

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Validate one persisted entry.
 *
 * The slot is read back from storage, so it must be treated as untrusted: a
 * partially written or hand-edited value used to flow straight into the picker,
 * where a `null` entry crashed the caller and an entry without an id could never
 * be toggled, aliased or removed again.
 */
function normalizeEntry(entry: unknown): InstalledModel | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const row = entry as Record<string, unknown>;
  const id = text(row.id);
  const providerId = text(row.providerId) ?? text(row.provider);
  const modelId = text(row.modelId) ?? text(row.model);
  if (!id || !providerId || !modelId) return undefined;
  const source = text(row.source);
  const addedAt = Number(row.addedAt);
  const lastUsedAt = Number(row.lastUsedAt);
  return {
    id,
    providerId,
    modelId,
    displayName: text(row.displayName) ?? modelId,
    alias: text(row.alias),
    // Only an explicit `false` disables a model; a missing flag means usable.
    enabled: row.enabled !== false,
    isDefault: row.isDefault === true,
    addedAt: Number.isFinite(addedAt) ? addedAt : Date.now(),
    lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : undefined,
    source: source && VALID_SOURCES.has(source) ? (source as InstalledModelSource) : "registry",
    customModelId: text(row.customModelId),
  };
}

/**
 * Keep the default flag consistent with the enabled set.
 *
 * Exactly one enabled model carries `isDefault` whenever anything is enabled:
 * deleting the default used to leave the library with no default at all, and
 * disabling it left the flag on a disabled entry while `getDefaultModel()`
 * answered with a different model — the stored state and the returned value
 * disagreed. When every model is disabled no entry may claim the flag.
 */
function repairDefaultFlag(models: InstalledModel[]): InstalledModel[] {
  const enabled = models.filter((model) => model.enabled);
  if (enabled.length === 0) {
    return models.map((model) => (model.isDefault ? { ...model, isDefault: false } : model));
  }
  const preferred = enabled.find((model) => model.isDefault) ?? enabled[0];
  return models.map((model) => {
    const shouldBeDefault = model.id === preferred.id;
    return model.isDefault === shouldBeDefault ? model : { ...model, isDefault: shouldBeDefault };
  });
}

export function loadInstalledModels(): InstalledModel[] {
  try {
    const raw = storeGet(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return repairDefaultFlag(
      parsed.map(normalizeEntry).filter((entry): entry is InstalledModel => Boolean(entry)),
    );
  } catch {
    return [];
  }
}

export function saveInstalledModels(models: InstalledModel[]): void {
  try {
    storeSet(STORAGE_KEY, JSON.stringify(models));
  } catch { /* ignore */ }
}

export function installModel(
  providerId: string,
  modelId: string,
  source: InstalledModelSource = "registry",
  customModelId?: string,
): InstalledModel | null {
  const models = loadInstalledModels();

  // Prevent duplicate: same providerId + modelId
  if (source !== "custom") {
    const dup = models.find((m) => m.providerId === providerId && m.modelId === modelId);
    if (dup) return dup;
  } else {
    // Custom: allow duplicate if different customModelId
    const dup = models.find(
      (m) => m.providerId === providerId && m.modelId === modelId && m.customModelId === customModelId,
    );
    if (dup) return dup;
  }

  // Look up display name from registry
  let displayName = modelId;
  let alias: string | undefined;
  const reg = MODEL_REGISTRY.find((m) => m.providerId === providerId && m.modelId === modelId);
  if (reg) {
    displayName = reg.displayName;
    alias = reg.alias;
  }

  const installed: InstalledModel = {
    id: `${providerId}:${modelId}:${Date.now()}`,
    providerId,
    modelId,
    displayName,
    alias,
    enabled: true,
    // The first *usable* model becomes the default: when every existing model is
    // disabled the repaired state has no default, so a fresh install must claim it.
    isDefault: !models.some((entry) => entry.enabled),
    addedAt: Date.now(),
    source,
    customModelId,
  };

  models.push(installed);
  saveInstalledModels(models);
  return installed;
}

export function uninstallModel(id: string): void {
  const models = loadInstalledModels();
  const filtered = models.filter((m) => m.id !== id);
  saveInstalledModels(filtered);
}

export function toggleModel(id: string): void {
  const models = loadInstalledModels();
  const m = models.find((x) => x.id === id);
  if (m) {
    m.enabled = !m.enabled;
    saveInstalledModels(models);
  }
}

export function setDefaultModel(id: string): void {
  const models = loadInstalledModels();
  let found = false;
  for (const m of models) {
    if (m.id === id) { m.isDefault = true; found = true; }
    else m.isDefault = false;
  }
  if (found) saveInstalledModels(models);
}

export function updateModelAlias(id: string, alias: string): void {
  const models = loadInstalledModels();
  const m = models.find((x) => x.id === id);
  if (m) {
    m.alias = alias || undefined;
    saveInstalledModels(models);
  }
}

export function markModelUsed(id: string): void {
  const models = loadInstalledModels();
  const m = models.find((x) => x.id === id);
  if (m) {
    m.lastUsedAt = Date.now();
    saveInstalledModels(models);
  }
}

export function getEnabledModels(): InstalledModel[] {
  return loadInstalledModels().filter((m) => m.enabled);
}

export function getDefaultModel(): InstalledModel | undefined {
  const models = loadInstalledModels();
  return models.find((m) => m.isDefault && m.enabled) ?? models.find((m) => m.enabled);
}

export function getModelsForProvider(providerId: string): InstalledModel[] {
  return loadInstalledModels().filter((m) => m.providerId === providerId);
}

// Migration: old key → new key (one-time)
export function migrateInstalledModels(): void {
  try {
    const oldValue = storeGet("tokenfence-installed-models");
    const newValue = storeGet(STORAGE_KEY);
    if (!newValue && oldValue) {
      storeSet(STORAGE_KEY, oldValue);
    }
  } catch { /* ignore */ }
}
