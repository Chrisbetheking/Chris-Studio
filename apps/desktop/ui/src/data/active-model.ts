import { loadProviderConfigs, saveProviderConfigs, PROVIDER_ENDPOINTS, type ProviderConfig } from "@tokenfence/shared/src/providers";
import { loadInstalledModels, getEnabledModels, type InstalledModel } from "@tokenfence/shared/src/installed-models";
import {
  MODEL_REGISTRY, getModelsForProvider, getProviderIds,
  getDefaultModelForProvider, type ModelRegistryItem,
} from "@tokenfence/shared/src/model-registry";

/* ============================================================
   active-model.ts — ActiveModelV2 Schema v1.3.6
   Storage key: tokenfence.activeModel
   Event: tokenfence:active-model-changed
   ============================================================ */

// ---------------------------------------------------------------------------
// ActiveModelV2 — schemaVersion: 2
// ---------------------------------------------------------------------------

export interface ActiveModelV2 {
  schemaVersion: 2;
  providerId: string;
  modelId: string;
  /** canonical provider display name (e.g. "OpenAI", "Anthropic") */
  providerDisplayName: string;
  /** canonical model display name (e.g. "GPT-5.5", "Claude Sonnet 4.5") */
  modelDisplayName: string;
  /** unified label: "OpenAI / GPT-5.5" */
  displayLabel: string;
  source: "installed" | "custom" | "library" | "fallback";
  configured: boolean;
  healthy: boolean;
  lastSetAt: number;
}

// ---------------------------------------------------------------------------
// Canonical provider display-name mapping (16 providers)
// ---------------------------------------------------------------------------

const CANONICAL_PROVIDER_NAMES: Record<string, string> = {
  "OpenAI":   "OpenAI",
  "Claude":   "Anthropic",
  "Gemini":   "Google",
  "DeepSeek": "DeepSeek",
  "Qwen":     "Alibaba",
  "Kimi":     "Moonshot",
  "Zhipu":    "Zhipu AI",
  "Doubao":   "ByteDance",
  "Groq":     "Groq",
  "Ollama":   "Ollama",
  "LM Studio":"LM Studio",
  "Azure":    "Azure",
  "Grok":     "xAI",
  "Cohere":   "Cohere",
  "Mistral":  "Mistral",
  "Reka":     "Reka",
};

export function canonicalizeProviderId(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  // direct match
  if (CANONICAL_PROVIDER_NAMES[trimmed]) return trimmed;
  // case-insensitive match
  const lower = trimmed.toLowerCase();
  for (const [key, _] of Object.entries(CANONICAL_PROVIDER_NAMES)) {
    if (key.toLowerCase() === lower) return key;
  }
  // return as-is if unknown
  return trimmed || "Unknown";
}

export function getProviderDisplayName(providerId: string): string {
  const canon = canonicalizeProviderId(providerId);
  return CANONICAL_PROVIDER_NAMES[canon] ?? canon;
}

// ---------------------------------------------------------------------------
// Normalize display text (fix escaped unicode in localStorage)
// ---------------------------------------------------------------------------

export function normalizeDisplayText(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  // Quick check: does it look like escaped unicode?
  if (!/\\u[0-9a-fA-F]{4}/.test(text)) return text;
  try {
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  } catch {
    return text;
  }
}

/** Check if a string still contains raw unicode escapes (garbled). */
export function hasRawUnicodeEscapes(value: unknown): boolean {
  if (value == null) return false;
  return /\\u[0-9a-fA-F]{4}/.test(String(value));
}

// ---------------------------------------------------------------------------
// No-configured-model label constants
// ---------------------------------------------------------------------------

export const NO_CONFIGURED_MODEL_LABEL_EN = "No configured model";
export const NO_CONFIGURED_MODEL_LABEL_ZH = "未配置模型";

export function getNoConfiguredModelLabel(): string {
  const lang = localStorage.getItem("tokenfence-lang") || "";
  return lang.toLowerCase().startsWith("zh")
    ? NO_CONFIGURED_MODEL_LABEL_ZH
    : NO_CONFIGURED_MODEL_LABEL_EN;
}

// ---------------------------------------------------------------------------
// Recursive normalize (objects, arrays)
// ---------------------------------------------------------------------------

export function normalizeRuntimeText<T>(value: T): T {
  if (typeof value === "string") {
    return normalizeDisplayText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRuntimeText(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeRuntimeText(item);
    }
    return out as T;
  }
  return value;
}


// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tokenfence.activeModel";

export function loadActiveModel(): ActiveModelV2 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Accept both v1 and v2 schemas
    if (!parsed?.providerId || !parsed?.modelId) return null;
    return normalizeActiveModelV2(parsed);
  } catch {
    return null;
  }
}

function normalizeActiveModelV2(parsed: any): ActiveModelV2 {
  const providerId = normalizeDisplayText(canonicalizeProviderId(parsed.providerId));
  const modelId = normalizeDisplayText(parsed.modelId);
  const providerDisplayName = normalizeDisplayText(
    parsed.providerDisplayName || getProviderDisplayName(providerId)
  );
  const modelDisplayName = normalizeDisplayText(
    parsed.modelDisplayName || parsed.displayName || modelId
  );
  return {
    schemaVersion: 2,
    providerId,
    modelId,
    providerDisplayName,
    modelDisplayName,
    displayLabel: normalizeDisplayText(
      parsed.displayLabel || `${providerDisplayName} / ${modelDisplayName}`
    ),
    source: parsed.source || "installed",
    configured: !!parsed.configured,
    healthy: !!parsed.healthy,
    lastSetAt: parsed.lastSetAt || Date.now(),
  };
}

export function saveActiveModel(am: ActiveModelV2): void {
  try {
    const normalized: ActiveModelV2 = {
      schemaVersion: 2,
      providerId: canonicalizeProviderId(normalizeDisplayText(am.providerId)),
      modelId: normalizeDisplayText(am.modelId),
      providerDisplayName: normalizeDisplayText(
        am.providerDisplayName || getProviderDisplayName(am.providerId)
      ),
      modelDisplayName: normalizeDisplayText(am.modelDisplayName || am.displayLabel || am.modelId),
      displayLabel: normalizeDisplayText(
        am.displayLabel || `${am.providerDisplayName} / ${am.modelDisplayName}`
      ),
      source: am.source || "installed",
      configured: !!am.configured,
      healthy: !!am.healthy,
      lastSetAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    dispatchActiveModelChanged();
  } catch { /* ignore */ }
}

export function clearActiveModel(): void {
  try { localStorage.removeItem(STORAGE_KEY); dispatchActiveModelChanged(); } catch {}
}

// ---------------------------------------------------------------------------
// Migration — clean old/broken localStorage data on startup
// ---------------------------------------------------------------------------

export function migrateActiveModelStorageV2(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    // Already v2 with all fields normalized?
    if (parsed.schemaVersion === 2
      && parsed.providerDisplayName
      && parsed.modelDisplayName
      && parsed.displayLabel
      && !hasRawUnicodeEscapes(parsed.providerDisplayName)
      && !hasRawUnicodeEscapes(parsed.modelDisplayName)
      && !hasRawUnicodeEscapes(parsed.displayLabel)) {
      return; // clean — no migration needed
    }

    // Migrate
    const configs = loadProviderConfigs();
    const providerId = normalizeDisplayText(canonicalizeProviderId(parsed.providerId));
    const cfg = configs.find((c) => c.provider === providerId && c.enabled && c.apiKey);

    if (cfg) {
      const reg = MODEL_REGISTRY.find(
        (m) => m.providerId === providerId && m.modelId === normalizeDisplayText(parsed.modelId)
      );
      const am: ActiveModelV2 = {
        schemaVersion: 2,
        providerId,
        modelId: normalizeDisplayText(parsed.modelId),
        providerDisplayName: getProviderDisplayName(providerId),
        modelDisplayName: normalizeDisplayText(reg?.displayName || parsed.modelDisplayName || parsed.displayName || parsed.modelId),
        displayLabel: `${getProviderDisplayName(providerId)} / ${normalizeDisplayText(reg?.displayName || parsed.modelDisplayName || parsed.displayName || parsed.modelId)}`,
        source: parsed.source || "installed",
        configured: true,
        healthy: cfg.lastHealthStatus === "ok",
        lastSetAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(am));
    } else {
      // No configured provider - clear stale data (normal state, not an error)
      localStorage.removeItem(STORAGE_KEY);
      dispatchActiveModelChanged();
    }
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Resolve — NO fake OpenAI fallback
// ---------------------------------------------------------------------------

export interface ResolvedModelV2 {
  providerId: string;
  modelId: string;
  providerDisplayName: string;
  modelDisplayName: string;
  displayLabel: string;
  source: ActiveModelV2["source"];
  configured: boolean;
  healthy: boolean;
  providerConfig: ProviderConfig | null;
  registryItem: ModelRegistryItem | null;
}

export function resolveActiveModel(): ResolvedModelV2 | null {
  // 1. Try localStorage active model
  const saved = loadActiveModel();
  if (saved) {
    const configs = loadProviderConfigs();
    const cfg = configs.find(
      (c) => canonicalizeProviderId(c.provider) === saved.providerId && c.enabled && c.apiKey
    );
    if (cfg) {
      const reg = MODEL_REGISTRY.find(
        (m) => m.providerId === saved.providerId && m.modelId === saved.modelId
      );
      return {
        providerId: saved.providerId,
        modelId: saved.modelId,
        providerDisplayName: saved.providerDisplayName,
        modelDisplayName: saved.modelDisplayName,
        displayLabel: saved.displayLabel,
        source: saved.source,
        configured: true,
        healthy: cfg.lastHealthStatus === "ok",
        providerConfig: cfg,
        registryItem: reg || null,
      };
    }
    // Saved provider no longer configured — clear and return null
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  // 2. Fallback: find any enabled + configured provider
  const configs = loadProviderConfigs();
  const enabled = configs.filter((c) => c.enabled && c.apiKey);
  const healthy = enabled.filter((c) => c.lastHealthStatus === "ok");
  const pool = healthy.length > 0 ? healthy : enabled;

  if (pool.length > 0) {
    const cfg = pool[0];
    const defModel = getDefaultModelForProvider(cfg.provider)
      ?? getModelsForProvider(cfg.provider)[0];
    if (defModel) {
      const resolved: ResolvedModelV2 = {
        providerId: normalizeDisplayText(cfg.provider),
        modelId: normalizeDisplayText(defModel.modelId),
        providerDisplayName: getProviderDisplayName(cfg.provider),
        modelDisplayName: normalizeDisplayText(defModel.displayName),
        displayLabel: `${getProviderDisplayName(cfg.provider)} / ${normalizeDisplayText(defModel.displayName)}`,
        source: "library",
        configured: true,
        healthy: cfg.lastHealthStatus === "ok",
        providerConfig: cfg,
        registryItem: defModel,
      };
      // Auto-save fallback
      saveActiveModel({
        schemaVersion: 2,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        providerDisplayName: resolved.providerDisplayName,
        modelDisplayName: resolved.modelDisplayName,
        displayLabel: resolved.displayLabel,
        source: "fallback",
        configured: true,
        healthy: resolved.healthy,
        lastSetAt: Date.now(),
      });
      return resolved;
    }
  }

  // 3. No configured provider — return null (no fake OpenAI)
  return null;
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

export function dispatchActiveModelChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent("tokenfence:active-model-changed"));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Unified View State
// ---------------------------------------------------------------------------

export interface ActiveModelViewState {
  hasModel: boolean;
  providerLabel: string;
  modelLabel: string;
  displayLabel: string;
  status: "healthy" | "configured" | "degraded" | "not_configured";
  configured: boolean;
  resolved: ResolvedModelV2 | null;
}

export function getActiveModelViewState(): ActiveModelViewState {
  const resolved = resolveActiveModel();

  if (!resolved || !resolved.configured) {
    const label = getNoConfiguredModelLabel();
    return {
      hasModel: false,
      providerId: "",
      providerDisplayName: label,
      modelId: "",
      modelDisplayName: "",
      providerLabel: label,
      modelLabel: "",
      displayLabel: label,
      status: "not_configured",
      configured: false,
      resolved: null,
    };
  }

  // Check for raw unicode escapes — if found, treat as degraded
  if (
    hasRawUnicodeEscapes(resolved.providerDisplayName)
    || hasRawUnicodeEscapes(resolved.modelDisplayName)
    || hasRawUnicodeEscapes(resolved.displayLabel)
  ) {
    return {
      hasModel: true,
      providerLabel: resolved.providerDisplayName,
      modelLabel: resolved.modelDisplayName,
      displayLabel: "[Escaped Unicode — needs migration]",
      status: "degraded",
      configured: true,
      resolved,
    };
  }

  return {
    hasModel: true,
    providerLabel: resolved.providerDisplayName,
    modelLabel: resolved.modelDisplayName,
    displayLabel: resolved.displayLabel,
    status: resolved.healthy ? "healthy" : "configured",
    configured: true,
    resolved,
  };
}

// ---------------------------------------------------------------------------
// Set Active Model
// ---------------------------------------------------------------------------

export function setActiveModelV2(input: {
  providerId: string;
  providerDisplayName?: string;
  modelId: string;
  modelDisplayName?: string;
  source?: ActiveModelV2["source"];
  configured?: boolean;
  healthy?: boolean;
}): ActiveModelV2 {
  const canonId = canonicalizeProviderId(normalizeDisplayText(input.providerId));
  const mid = normalizeDisplayText(input.modelId);
  const providerDisplay = normalizeDisplayText(
    input.providerDisplayName || getProviderDisplayName(canonId),
  );
  const modelDisplay = normalizeDisplayText(input.modelDisplayName || mid);
  const source: ActiveModelV2["source"] = input.source || "installed";

  // Determine configured status: prefer explicit flag, then check provider configs
  let configured: boolean;
  if (typeof input.configured === "boolean") {
    configured = input.configured;
  } else {
    const configs = loadProviderConfigs();
    const cfg = configs.find((c) => canonicalizeProviderId(c.provider) === canonId && c.enabled && c.apiKey);
    configured = !!cfg;
  }

  // Determine health: prefer explicit flag, then check saved health
  let healthy: boolean;
  if (typeof input.healthy === "boolean") {
    healthy = input.healthy;
  } else {
    const healthResults = loadHealthResults();
    healthy = healthResults[canonId]?.status === "ok";
  }

  const activeModel: ActiveModelV2 = {
    schemaVersion: 2,
    providerId: canonId,
    modelId: mid,
    providerDisplayName: providerDisplay,
    modelDisplayName: modelDisplay,
    displayLabel: `${providerDisplay} / ${modelDisplay}`,
    source,
    configured,
    healthy,
    lastSetAt: Date.now(),
  };

  saveActiveModel(activeModel);
  dispatchActiveModelChanged();

  return activeModel;
}

export function setActiveModel(
  providerId: string,
  modelId: string,
  displayName?: string,
  source: ActiveModelV2["source"] = "installed",
): void {
  setActiveModelV2({
    providerId,
    modelId,
    modelDisplayName: displayName,
    source,
  });
}
// ---------------------------------------------------------------------------
// Pre-send Validation
// ---------------------------------------------------------------------------

export interface ModelValidationResult {
  valid: boolean;
  errorKey: string;
  errorEn: string;
  errorZh: string;
}

export function validateModelForSend(): ModelValidationResult {
  const resolved = resolveActiveModel();

  if (!resolved) {
    return {
      valid: false,
      errorKey: "model.notConfigured",
      errorEn: "Model not configured. Please configure a provider API key first.",
      errorZh: "模型未配置，请先配置模型提供商。",
    };
  }

  if (!resolved.configured) {
    return {
      valid: false,
      errorKey: "model.notConfigured",
      errorEn: `Provider "${resolved.providerId}" is not configured. Please configure the API key first.`,
      errorZh: `提供商 "${resolved.providerId}" 未配置，请先配置 API Key。`,
    };
  }

  if (!resolved.providerConfig?.apiKey) {
    return {
      valid: false,
      errorKey: "model.noApiKey",
      errorEn: `No API key configured for ${resolved.providerId}. Please add your API key in Models > Providers.`,
      errorZh: `${resolved.providerId} 未配置 API Key，请在模型 > 提供商中添加。`,
    };
  }

  if (!resolved.providerConfig.baseUrl && !PROVIDER_ENDPOINTS[resolved.providerId]?.baseUrl) {
    return {
      valid: false,
      errorKey: "model.noBaseUrl",
      errorEn: `No base URL configured for ${resolved.providerId}.`,
      errorZh: `${resolved.providerId} 未配置 Base URL。`,
    };
  }

  if (!resolved.modelId) {
    return {
      valid: false,
      errorKey: "model.noModelId",
      errorEn: "No model selected.",
      errorZh: "未选择模型。",
    };
  }

  return { valid: true, errorKey: "", errorEn: "", errorZh: "" };
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export interface HealthResult {
  status: "ok" | "degraded" | "failed" | "unknown" | "not_configured";
  latencyMs?: number;
  error?: string;
  testedAt: number;
}

export async function runProviderHealthCheck(config: ProviderConfig): Promise<HealthResult> {
  if (!config.apiKey) {
    return { status: "not_configured", error: "No API key configured", testedAt: Date.now() };
  }
  const ep = PROVIDER_ENDPOINTS[config.provider];
  if (!ep) {
    return { status: "failed", error: "Unknown provider: " + config.provider, testedAt: Date.now() };
  }
  const baseUrl = config.baseUrl || ep.baseUrl;
  const model = config.defaultModel || config.model || getDefaultModelForProvider(config.provider)?.modelId || "gpt-4o";
  const url = baseUrl + ep.chatEndpoint.replace("{model}", model);
  if (config.provider === "Claude" || config.provider === "Gemini") {
    return { status: "degraded", error: "Health check adapter not implemented yet.", testedAt: Date.now() };
  }
  const start = performance.now();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.apiKey,
    };
    const body = JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 });
    const resp = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
    const latencyMs = Math.round(performance.now() - start);
    if (resp.ok) return { status: "ok", latencyMs, testedAt: Date.now() };
    if (resp.status === 401 || resp.status === 403) {
      return { status: "failed", error: "Auth error (HTTP " + resp.status + ")", latencyMs, testedAt: Date.now() };
    }
    const text = await resp.text().catch(() => "");
    return { status: "degraded", error: "HTTP " + resp.status + ": " + text.slice(0, 200), latencyMs, testedAt: Date.now() };
  } catch (e: any) {
    const latencyMs = Math.round(performance.now() - start);
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return { status: "failed", error: "Connection timeout (15s)", latencyMs, testedAt: Date.now() };
    }
    return { status: "failed", error: "Network error: " + (e.message || "Unknown"), latencyMs, testedAt: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Persist health results
// ---------------------------------------------------------------------------

const HEALTH_KEY = "tokenfence.providerHealth";
export interface SavedHealth { [providerId: string]: HealthResult; }
export function loadHealthResults(): SavedHealth {
  try { const raw = localStorage.getItem(HEALTH_KEY); if (raw) { const parsed = JSON.parse(raw); return normalizeRuntimeText(parsed); } return {}; } catch { return {}; }
}
export function saveHealthResult(providerId: string, result: HealthResult): void {
  const all = loadHealthResults();
  all[providerId] = result;
  try { localStorage.setItem(HEALTH_KEY, JSON.stringify(all)); } catch {}
}

// ---------------------------------------------------------------------------
// Custom Models
// ---------------------------------------------------------------------------

const CUSTOM_KEY = "tokenfence.customModels";
export interface CustomModelEntry {
  id: string; providerId: string; providerName: string; modelId: string;
  displayName: string; baseUrl: string; apiKey: string;
  contextLength: number; modelType: "chat" | "reasoning" | "coding" | "vision"; addedAt: number;
}
export function loadCustomModels(): CustomModelEntry[] {
  try { const raw = localStorage.getItem(CUSTOM_KEY); if (raw) { const parsed = JSON.parse(raw); return normalizeRuntimeText(parsed); } return []; } catch { return []; }
}
export function saveCustomModel(entry: CustomModelEntry): void {
  const models = loadCustomModels();
  const idx = models.findIndex((m) => m.id === entry.id);
  if (idx >= 0) models[idx] = entry; else models.push(entry);
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(models)); } catch {}
}
export function removeCustomModel(id: string): void {
  const models = loadCustomModels().filter((m) => m.id !== id);
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(models)); } catch {}
}
export function customModelToProviderConfig(entry: CustomModelEntry): ProviderConfig {
  return {
    provider: entry.providerId, displayName: entry.providerName,
    deployment: "cloud" as const, enabled: true,
    apiKey: entry.apiKey, baseUrl: entry.baseUrl,
    defaultModel: entry.modelId, model: entry.modelId,
    lastHealthStatus: "unknown" as const,
  };
}

// ---------------------------------------------------------------------------
// Has Any Configured Provider
// ---------------------------------------------------------------------------

export function hasAnyConfiguredProvider(): boolean {
  const configs = loadProviderConfigs();
  return configs.some((c) => c.enabled && c.apiKey);
}
