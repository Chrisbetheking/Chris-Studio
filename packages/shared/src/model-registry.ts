/* ============================================================
   TokenFence Studio — Model Registry v1.0.14
   ============================================================ */

export type ModelCapability =
  | "chat"
  | "reasoning"
  | "coding"
  | "vision"
  | "long-context"
  | "embedding"
  | "audio"
  | "image"
  | "fast"
  | "cheap"
  | "local"
  | "privacy";

export type ModelStatus = "configured" | "not_configured" | "needs_test" | "failed" | "local_unavailable";

export type ModelPickReason =
  | "configured"
  | "healthy"
  | "recent"
  | "favorite"
  | "routing"
  | "fallback";

export type PickBestModelOptions = {
  requestedProvider?: string;
  requestedModel?: string;
  fileTypes?: string[];
  taskHint?: "chat" | "code" | "vision" | "long-context" | "reasoning" | "fast";
  allowUnconfigured?: boolean;
};

export interface ModelRegistryItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  alias?: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  maxOutputTokens?: number;
  status: ModelStatus;
  isDefault?: boolean;
  isRecommended?: boolean;
  isCustom?: boolean;
  notes?: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  fileExtensions: string[];
  contentHints?: string[];
  preferredCapability: ModelCapability;
  preferredProviderId?: string;
  preferredModelId?: string;
  fallbackProviderId?: string;
  fallbackModelId?: string;
  autoSwitch: boolean;
  askBeforeSwitch: boolean;
}

/* ============================================================
   Model Registry — Latest Catalog
   ============================================================ */

export const MODEL_REGISTRY: ModelRegistryItem[] = [
  // === OpenAI ===
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-5.5", displayName: "GPT-5.5", capabilities: ["chat","reasoning","coding","long-context"], contextWindow: 256000, status: "not_configured", isRecommended: true },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-5.5-pro", displayName: "GPT-5.5 Pro", capabilities: ["chat","reasoning","coding","long-context","vision"], contextWindow: 256000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-5.4", displayName: "GPT-5.4", capabilities: ["chat","reasoning","coding","vision"], contextWindow: 256000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-5.4-mini", displayName: "GPT-5.4 Mini", capabilities: ["chat","reasoning","coding","fast","cheap"], contextWindow: 256000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-5.1", displayName: "GPT-5.1", capabilities: ["chat","reasoning","coding"], contextWindow: 256000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-5.1-mini", displayName: "GPT-5.1 Mini", capabilities: ["chat","fast","cheap"], contextWindow: 256000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-4.1", displayName: "GPT-4.1", capabilities: ["chat","reasoning","coding"], contextWindow: 1000000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", capabilities: ["chat","fast","cheap"], contextWindow: 1000000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-4o", displayName: "GPT-4o", capabilities: ["chat","reasoning","coding","vision"], contextWindow: 128000, status: "not_configured", isDefault: true },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", capabilities: ["chat","fast","cheap"], contextWindow: 128000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "o4-mini", displayName: "o4-mini", capabilities: ["reasoning","coding"], contextWindow: 200000, status: "not_configured" },
  { providerId: "OpenAI", providerName: "OpenAI", modelId: "o3", displayName: "o3", capabilities: ["reasoning","coding"], contextWindow: 200000, status: "not_configured" },

  // === Claude / Anthropic ===
  { providerId: "Claude", providerName: "Anthropic", modelId: "claude-opus-4.5", displayName: "Claude Opus 4.5", capabilities: ["chat","reasoning","coding","long-context"], contextWindow: 200000, status: "not_configured", isRecommended: true },
  { providerId: "Claude", providerName: "Anthropic", modelId: "claude-sonnet-4.5", displayName: "Claude Sonnet 4.5", capabilities: ["chat","reasoning","coding"], contextWindow: 200000, status: "not_configured", isDefault: true },
  { providerId: "Claude", providerName: "Anthropic", modelId: "claude-haiku-4.5", displayName: "Claude Haiku 4.5", capabilities: ["chat","fast","cheap"], contextWindow: 200000, status: "not_configured" },

  // === Gemini ===
  { providerId: "Gemini", providerName: "Google", modelId: "gemini-3.0-pro", displayName: "Gemini 3.0 Pro", capabilities: ["chat","reasoning","coding","vision","audio","long-context"], contextWindow: 2000000, status: "not_configured", isRecommended: true },
  { providerId: "Gemini", providerName: "Google", modelId: "gemini-3.0-flash", displayName: "Gemini 3.0 Flash", capabilities: ["chat","vision","audio","fast"], contextWindow: 1000000, status: "not_configured", isDefault: true },
  { providerId: "Gemini", providerName: "Google", modelId: "gemini-3.1-pro", displayName: "Gemini 3.1 Pro", capabilities: ["chat","reasoning","coding","vision","audio","long-context"], contextWindow: 2000000, status: "not_configured" },
  { providerId: "Gemini", providerName: "Google", modelId: "gemini-3.1-flash", displayName: "Gemini 3.1 Flash", capabilities: ["chat","vision","audio","fast"], contextWindow: 1000000, status: "not_configured" },
  { providerId: "Gemini", providerName: "Google", modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", capabilities: ["chat","reasoning","coding","vision","audio","long-context"], contextWindow: 2000000, status: "not_configured" },
  { providerId: "Gemini", providerName: "Google", modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", capabilities: ["chat","vision","fast"], contextWindow: 1000000, status: "not_configured" },

  // === DeepSeek ===
  { providerId: "DeepSeek", providerName: "DeepSeek", modelId: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", capabilities: ["chat","reasoning","coding","long-context"], contextWindow: 128000, status: "not_configured", isRecommended: true },
  { providerId: "DeepSeek", providerName: "DeepSeek", modelId: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", capabilities: ["chat","fast","cheap"], contextWindow: 128000, status: "not_configured", isDefault: true },
  { providerId: "DeepSeek", providerName: "DeepSeek", modelId: "deepseek-v4-lite", displayName: "DeepSeek V4 Lite", capabilities: ["chat","fast","cheap"], contextWindow: 64000, status: "not_configured" },

  // === Qwen ===
  { providerId: "Qwen", providerName: "Alibaba", modelId: "qwen3.5-max", displayName: "Qwen 3.5 Max", capabilities: ["chat","reasoning","coding","long-context"], contextWindow: 128000, status: "not_configured", isRecommended: true },
  { providerId: "Qwen", providerName: "Alibaba", modelId: "qwen3.5-plus", displayName: "Qwen 3.5 Plus", capabilities: ["chat","reasoning","coding"], contextWindow: 128000, status: "not_configured", isDefault: true },
  { providerId: "Qwen", providerName: "Alibaba", modelId: "qwen3.5-turbo", displayName: "Qwen 3.5 Turbo", capabilities: ["chat","fast","cheap"], contextWindow: 64000, status: "not_configured" },
  { providerId: "Qwen", providerName: "Alibaba", modelId: "qwen3-coder-plus", displayName: "Qwen 3 Coder Plus", capabilities: ["chat","coding","reasoning"], contextWindow: 128000, status: "not_configured" },

  // === Kimi / Moonshot ===
  { providerId: "Kimi", providerName: "Moonshot", modelId: "kimi-k2.6", displayName: "Kimi K2.6", capabilities: ["chat","reasoning","coding","long-context","vision"], contextWindow: 128000, status: "not_configured", isRecommended: true },
  { providerId: "Kimi", providerName: "Moonshot", modelId: "kimi-k2.6-thinking", displayName: "Kimi K2.6 Thinking", capabilities: ["reasoning","coding","long-context"], contextWindow: 128000, status: "not_configured", isDefault: true },

  // === Zhipu / GLM ===
  { providerId: "Zhipu", providerName: "Zhipu AI", modelId: "glm-5.1", displayName: "GLM-5.1", capabilities: ["chat","reasoning","coding","long-context","vision"], contextWindow: 128000, status: "not_configured", isRecommended: true },
  { providerId: "Zhipu", providerName: "Zhipu AI", modelId: "glm-5.1-flash", displayName: "GLM-5.1 Flash", capabilities: ["chat","vision","fast","cheap"], contextWindow: 128000, status: "not_configured", isDefault: true },

  // === Doubao / ByteDance ===
  { providerId: "Doubao", providerName: "ByteDance", modelId: "doubao-1.5-pro-256k", displayName: "Doubao 1.5 Pro", capabilities: ["chat","reasoning","coding","long-context"], contextWindow: 256000, status: "not_configured", isRecommended: true },
  { providerId: "Doubao", providerName: "ByteDance", modelId: "doubao-1.5-lite-32k", displayName: "Doubao 1.5 Lite", capabilities: ["chat","fast","cheap"], contextWindow: 32000, status: "not_configured", isDefault: true },

  // === Groq ===
  { providerId: "Groq", providerName: "Groq", modelId: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B Instant", capabilities: ["chat","fast","cheap"], contextWindow: 128000, status: "not_configured", isRecommended: true },
  { providerId: "Groq", providerName: "Groq", modelId: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B", capabilities: ["chat","reasoning","coding"], contextWindow: 128000, status: "not_configured", isDefault: true },
  { providerId: "Groq", providerName: "Groq", modelId: "mixtral-8x7b-32768", displayName: "Mixtral 8x7B", capabilities: ["chat","fast"], contextWindow: 32768, status: "not_configured" },

  // === Ollama (local) ===
  { providerId: "Ollama", providerName: "Ollama", modelId: "llama3.1", displayName: "Llama 3.1", alias: "llama3.1:8b", capabilities: ["chat","local","privacy"], contextWindow: 128000, status: "local_unavailable", isDefault: true },
  { providerId: "Ollama", providerName: "Ollama", modelId: "mistral", displayName: "Mistral", alias: "mistral:7b", capabilities: ["chat","fast","local"], contextWindow: 32000, status: "local_unavailable" },
  { providerId: "Ollama", providerName: "Ollama", modelId: "codellama", displayName: "Code Llama", alias: "codellama:7b", capabilities: ["coding","local"], contextWindow: 16000, status: "local_unavailable" },

  // === LM Studio (local) ===
  { providerId: "LM Studio", providerName: "LM Studio", modelId: "local-model", displayName: "Local Model", capabilities: ["chat","local","privacy"], status: "local_unavailable", isDefault: true },
];

/* ============================================================
   Routing Rules
   ============================================================ */

export const ROUTING_RULES: RoutingRule[] = [
  { id: "route-code", name: "Code files", fileExtensions: [".ts",".tsx",".js",".jsx",".py",".rs",".go",".java",".kt",".swift",".cpp",".c",".h",".cs",".rb",".php",".sql"], preferredCapability: "coding", preferredProviderId: "Claude", preferredModelId: "claude-sonnet-4.5", fallbackProviderId: "OpenAI", fallbackModelId: "gpt-4o", autoSwitch: true, askBeforeSwitch: false },
  { id: "route-vision", name: "Images & vision", fileExtensions: [".png",".jpg",".jpeg",".gif",".webp",".bmp",".svg"], preferredCapability: "vision", preferredProviderId: "OpenAI", preferredModelId: "gpt-4o", fallbackProviderId: "Gemini", fallbackModelId: "gemini-2.5-pro", autoSwitch: true, askBeforeSwitch: false },
  { id: "route-long-doc", name: "Long documents", fileExtensions: [".md",".txt",".rst",".tex"], preferredCapability: "long-context", preferredProviderId: "Claude", preferredModelId: "claude-sonnet-4.5", fallbackProviderId: "Gemini", fallbackModelId: "gemini-2.5-pro", autoSwitch: true, askBeforeSwitch: false },
  { id: "route-data", name: "Data files", fileExtensions: [".json",".csv",".xml",".yaml",".yml",".toml"], preferredCapability: "reasoning", preferredProviderId: "OpenAI", preferredModelId: "gpt-4o", fallbackProviderId: "Claude", fallbackModelId: "claude-sonnet-4.5", autoSwitch: true, askBeforeSwitch: false },
  { id: "route-sensitive", name: "Sensitive files", fileExtensions: [".env",".key",".pem",".secret",".p12",".pfx"], preferredCapability: "privacy", preferredProviderId: "Ollama", preferredModelId: "llama3.1", fallbackProviderId: "LM Studio", fallbackModelId: "local-model", autoSwitch: true, askBeforeSwitch: true },
  { id: "route-audio", name: "Audio files", fileExtensions: [".mp3",".wav",".m4a",".ogg",".flac"], preferredCapability: "audio", preferredProviderId: "Gemini", preferredModelId: "gemini-2.5-pro", fallbackProviderId: "OpenAI", fallbackModelId: "gpt-4o", autoSwitch: true, askBeforeSwitch: false },
  { id: "route-fast", name: "Quick/cheap routing", fileExtensions: [".log",".diff",".patch"], preferredCapability: "fast", preferredProviderId: "OpenAI", preferredModelId: "gpt-4o-mini", fallbackProviderId: "Groq", fallbackModelId: "llama-3.1-8b-instant", autoSwitch: true, askBeforeSwitch: false },
];

/* ============================================================
   Registry Helpers
   ============================================================ */

export function getModelsForProvider(providerId: string): ModelRegistryItem[] {
  return MODEL_REGISTRY.filter((m) => m.providerId === providerId);
}

export function getModelById(providerId: string, modelId: string): ModelRegistryItem | undefined {
  return MODEL_REGISTRY.find((m) => m.providerId === providerId && m.modelId === modelId);
}

export function getDefaultModelForProvider(providerId: string): ModelRegistryItem | undefined {
  const models = getModelsForProvider(providerId);
  return models.find((m) => m.isDefault) ?? models[0];
}

export function getRecommendedModelForProvider(providerId: string): ModelRegistryItem | undefined {
  const models = getModelsForProvider(providerId);
  return models.find((m) => m.isRecommended) ?? models.find((m) => m.isDefault) ?? models[0];
}

export function findRoutingRule(filename: string): RoutingRule | undefined {
  const ext = "." + (filename.split(".").pop()?.toLowerCase() ?? "");
  return ROUTING_RULES.find((r) => r.fileExtensions.includes(ext));
}

export function findBestModelForCapability(
  capability: ModelCapability,
  providerId?: string,
): ModelRegistryItem | undefined {
  let candidates = MODEL_REGISTRY.filter((m) => m.capabilities.includes(capability));
  if (providerId) {
    candidates = candidates.filter((m) => m.providerId === providerId);
  }
  const configured = candidates.filter((m) => m.status === "configured");
  if (configured.length > 0) return configured[0];
  return candidates[0];
}

export function searchModels(query: string): ModelRegistryItem[] {
  const q = query.toLowerCase();
  return MODEL_REGISTRY.filter(
    (m) =>
      m.displayName.toLowerCase().includes(q) ||
      m.modelId.toLowerCase().includes(q) ||
      m.providerName.toLowerCase().includes(q) ||
      (m.alias && m.alias.toLowerCase().includes(q)),
  );
}

export function getProviderIds(): string[] {
  return [...new Set(MODEL_REGISTRY.map((m) => m.providerId))];
}

export function updateModelStatus(
  providerId: string,
  modelId: string,
  status: ModelStatus,
): void {
  const model = MODEL_REGISTRY.find((m) => m.providerId === providerId && m.modelId === modelId);
  if (model) model.status = status;
}

/* ============================================================
   Configured-First Model Selection
   ============================================================ */

export interface PickResult {
  providerId: string;
  modelId: string;
  reason: ModelPickReason;
  configured: boolean;
  displayName: string;
}

export function pickBestAvailableModel(
  providers: { provider: string; enabled: boolean; apiKey?: string; lastHealthStatus?: string }[],
  options?: PickBestModelOptions,
): PickResult | null {
  const configuredProviders = providers.filter(p => p.enabled && p.apiKey);
  const healthyProviders = configuredProviders.filter(p => p.lastHealthStatus === "ok");

  // 1. If a specific configured provider+model is requested, use it
  if (options?.requestedProvider && options?.requestedModel) {
    const cfg = providers.find(p => p.provider === options.requestedProvider);
    if (cfg?.enabled && cfg?.apiKey) {
      return { providerId: options.requestedProvider, modelId: options.requestedModel, reason: "configured", configured: true, displayName: options.requestedModel };
    }
  }

  // 2. Pick favorites (stored in localStorage)
  let favorites: { providerId: string; modelId: string }[] = [];
  try {
    const raw = localStorage.getItem("tokenfence-favorite-models");
    if (raw) favorites = JSON.parse(raw);
  } catch {}
  for (const fav of favorites) {
    const cfg = providers.find(p => p.provider === fav.providerId);
    if (cfg?.enabled && cfg?.apiKey) {
      return { providerId: fav.providerId, modelId: fav.modelId, reason: "favorite", configured: true, displayName: fav.modelId };
    }
  }

  // 3. Pick recent (stored in localStorage)
  let recents: { providerId: string; modelId: string }[] = [];
  try {
    const raw = localStorage.getItem("tokenfence-recent-models");
    if (raw) recents = JSON.parse(raw);
  } catch {}
  for (const r of recents) {
    const cfg = providers.find(p => p.provider === r.providerId);
    if (cfg?.enabled && cfg?.apiKey) {
      return { providerId: r.providerId, modelId: r.modelId, reason: "recent", configured: true, displayName: r.modelId };
    }
  }

  // 4. Pick healthy configured provider
  if (healthyProviders.length > 0) {
    const hp = healthyProviders[0];
    const defModel = getDefaultModelForProvider(hp.provider) ?? getModelsForProvider(hp.provider)[0];
    if (defModel) {
      return { providerId: hp.provider, modelId: defModel.modelId, reason: "healthy", configured: true, displayName: defModel.displayName };
    }
  }

  // 5. Pick any configured provider
  if (configuredProviders.length > 0) {
    const cp = configuredProviders[0];
    const defModel = getDefaultModelForProvider(cp.provider) ?? getModelsForProvider(cp.provider)[0];
    if (defModel) {
      return { providerId: cp.provider, modelId: defModel.modelId, reason: "configured", configured: true, displayName: defModel.displayName };
    }
  }

  // 6. Try task hint routing
  if (options?.taskHint) {
    const capMap: Record<string, ModelCapability> = { chat: "chat", code: "coding", vision: "vision", "long-context": "long-context", reasoning: "reasoning", fast: "fast" };
    const cap = capMap[options.taskHint];
    if (cap) {
      const best = findBestModelForCapability(cap);
      if (best) {
        return { providerId: best.providerId, modelId: best.modelId, reason: "routing", configured: false, displayName: best.displayName };
      }
    }
  }

  // 7. Fallback to default OpenAI model
  if (!options?.allowUnconfigured && configuredProviders.length === 0) return null;
  const fallback = getModelsForProvider("OpenAI")[0];
  if (fallback) {
    return { providerId: "OpenAI", modelId: fallback.modelId, reason: "fallback", configured: false, displayName: fallback.displayName };
  }
  return null;
}

export function addRecentModel(providerId: string, modelId: string): void {
  try {
    const raw = localStorage.getItem("tokenfence-recent-models");
    let recents: { providerId: string; modelId: string }[] = raw ? JSON.parse(raw) : [];
    recents = recents.filter(r => !(r.providerId === providerId && r.modelId === modelId));
    recents.unshift({ providerId, modelId });
    if (recents.length > 10) recents = recents.slice(0, 10);
    localStorage.setItem("tokenfence-recent-models", JSON.stringify(recents));
  } catch {}
}

export function getStatusColor(status: ModelStatus): string {
  switch (status) {
    case "configured": return "var(--green)";
    case "not_configured": return "var(--text-muted)";
    case "needs_test": return "var(--amber)";
    case "failed": return "var(--red)";
    case "local_unavailable": return "var(--text-muted)";
    default: return "var(--text-muted)";
  }
}

export function getStatusLabel(status: ModelStatus): string {
  switch (status) {
    case "configured": return "Configured";
    case "not_configured": return "Not configured";
    case "needs_test": return "Needs test";
    case "failed": return "Failed";
    case "local_unavailable": return "Local unavailable";
    default: return "Unknown";
  }
}

