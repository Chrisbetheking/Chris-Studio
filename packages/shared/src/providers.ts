import type { ProviderModel } from "./types";
import { storeGet, storeSet } from "./agent-runtime/safeStorage";

export interface ProviderConfig {
  provider: string;
  model: string;
  customModelId?: string;
  apiKey: string;
  baseUrl: string;
  endpoint: string;
  deployment: "cloud" | "local";
  enabled: boolean;
  lastHealthCheck?: number;
  lastHealthStatus?: "ok" | "degraded" | "failed" | "unknown";
  lastHealthError?: string;
}

export const PROVIDERS: ProviderModel[] = [
  { provider: "OpenAI", model: "gpt-4o", deployment: "cloud", bestFor: "General purpose, coding, reasoning", riskPolicy: "Standard cloud policy", contextWindow: 128000 },
  { provider: "Claude", model: "claude-sonnet-4-20250514", deployment: "cloud", bestFor: "Long documents, nuanced analysis", riskPolicy: "Standard cloud policy", contextWindow: 200000 },
  { provider: "Gemini", model: "gemini-2.5-pro", deployment: "cloud", bestFor: "Multimodal, large context", riskPolicy: "Standard cloud policy", contextWindow: 1048576 },
  { provider: "DeepSeek", model: "deepseek-chat", deployment: "cloud", bestFor: "Cost-efficient reasoning, Chinese", riskPolicy: "Cloud, hosted in China", contextWindow: 128000 },
  { provider: "Qwen", model: "qwen-max", deployment: "cloud", bestFor: "Chinese language, multilingual", riskPolicy: "Cloud, hosted in China", contextWindow: 32768 },
  { provider: "Kimi", model: "moonshot-v1-128k", deployment: "cloud", bestFor: "Chinese web search, long context", riskPolicy: "Cloud, hosted in China", contextWindow: 128000 },
  { provider: "Doubao", model: "doubao-pro-256k", deployment: "cloud", bestFor: "Chinese contexts, long text", riskPolicy: "Cloud, hosted in China", contextWindow: 256000 },
  { provider: "Zhipu", model: "glm-4-plus", deployment: "cloud", bestFor: "Chinese enterprise AI, GLM series", riskPolicy: "Cloud, hosted in China", contextWindow: 128000 },
  { provider: "xAI", model: "grok-3", deployment: "cloud", bestFor: "Real-time knowledge, reasoning", riskPolicy: "Standard cloud policy", contextWindow: 131072 },
  { provider: "Mistral", model: "mistral-large", deployment: "cloud", bestFor: "European AI, multilingual", riskPolicy: "Standard cloud policy", contextWindow: 128000 },
  { provider: "Cohere", model: "command-r-plus", deployment: "cloud", bestFor: "RAG, enterprise search", riskPolicy: "Standard cloud policy", contextWindow: 128000 },
  { provider: "Perplexity", model: "sonar-pro", deployment: "cloud", bestFor: "Web-grounded search, research", riskPolicy: "Standard cloud policy", contextWindow: 200000 },
  { provider: "Groq", model: "llama-3.3-70b", deployment: "cloud", bestFor: "Fast inference, open models", riskPolicy: "Standard cloud policy", contextWindow: 128000 },
  { provider: "Together", model: "mistral-7b", deployment: "cloud", bestFor: "Open-source models, fast API", riskPolicy: "Standard cloud policy", contextWindow: 32768 },
  { provider: "Ollama", model: "llama3.2", deployment: "local", bestFor: "Fully offline, privacy-first", riskPolicy: "Local only, no data leaves device", contextWindow: 128000 },
  { provider: "LM Studio", model: "local-model", deployment: "local", bestFor: "Local inference, zero telemetry", riskPolicy: "Local only, no data leaves device", contextWindow: 128000 },
  { provider: "Custom", model: "custom", deployment: "cloud", bestFor: "OpenAI-compatible endpoints", riskPolicy: "Depends on endpoint configuration", contextWindow: 128000 },
];

export const PROVIDER_ENDPOINTS: Record<string, { baseUrl: string; chatEndpoint: string; modelsEndpoint: string }> = {
  OpenAI:     { baseUrl: "https://api.openai.com", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Claude:     { baseUrl: "https://api.anthropic.com", chatEndpoint: "/v1/messages", modelsEndpoint: "/v1/models" },
  Gemini:     { baseUrl: "https://generativelanguage.googleapis.com", chatEndpoint: "/v1beta/models/{model}:generateContent", modelsEndpoint: "/v1beta/models" },
  DeepSeek:   { baseUrl: "https://api.deepseek.com", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Qwen:       { baseUrl: "https://dashscope.aliyuncs.com", chatEndpoint: "/compatible-mode/v1/chat/completions", modelsEndpoint: "/compatible-mode/v1/models" },
  Kimi:       { baseUrl: "https://api.moonshot.cn", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Doubao:     { baseUrl: "https://ark.cn-beijing.volces.com", chatEndpoint: "/api/v3/chat/completions", modelsEndpoint: "/api/v3/models" },
  Zhipu:      { baseUrl: "https://open.bigmodel.cn", chatEndpoint: "/api/paas/v4/chat/completions", modelsEndpoint: "/api/paas/v4/models" },
  xAI:        { baseUrl: "https://api.x.ai", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Mistral:    { baseUrl: "https://api.mistral.ai", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Cohere:     { baseUrl: "https://api.cohere.ai", chatEndpoint: "/v2/chat", modelsEndpoint: "/v2/models" },
  Perplexity: { baseUrl: "https://api.perplexity.ai", chatEndpoint: "/chat/completions", modelsEndpoint: "/v1/models" },
  Groq:       { baseUrl: "https://api.groq.com", chatEndpoint: "/openai/v1/chat/completions", modelsEndpoint: "/openai/v1/models" },
  Together:   { baseUrl: "https://api.together.xyz", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Ollama:     { baseUrl: "http://localhost:11434", chatEndpoint: "/api/chat", modelsEndpoint: "/api/tags" },
  "LM Studio":{ baseUrl: "http://localhost:1234", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
  Custom:     { baseUrl: "http://localhost:8080", chatEndpoint: "/v1/chat/completions", modelsEndpoint: "/v1/models" },
};

// File-type based model routing rules
export interface RoutingRule {
  id: string;
  extensions: string[];
  provider: string;
  model: string;
  reason: string;
}

export const FILE_ROUTING_RULES: RoutingRule[] = [
  { id: "pdf-vision", extensions: [".pdf"], provider: "Gemini", model: "gemini-2.5-pro", reason: "PDF needs vision/large context" },
  { id: "image-vision", extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"], provider: "Gemini", model: "gemini-2.5-pro", reason: "Image analysis needs vision model" },
  { id: "chinese-doc", extensions: [".zh.md", ".zh-CN.md"], provider: "DeepSeek", model: "deepseek-chat", reason: "Chinese content optimized for DeepSeek" },
  { id: "long-doc", extensions: [".md", ".txt"], provider: "Claude", model: "claude-sonnet-4-20250514", reason: "Long documents benefit from large context" },
  { id: "code-file", extensions: [".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".cs", ".rb", ".php", ".swift", ".kt"], provider: "OpenAI", model: "gpt-4o", reason: "Code analysis optimized for GPT-4o" },
  { id: "data-file", extensions: [".json", ".csv", ".xml", ".yaml", ".yml", ".toml"], provider: "OpenAI", model: "gpt-4o", reason: "Structured data parsing" },
  { id: "sensitive-local", extensions: [".env", ".key", ".pem", ".secret"], provider: "Ollama", model: "llama3.2", reason: "Sensitive files stay local" },
];

export function getRoutingRuleForFile(filename: string): RoutingRule | undefined {
  const ext = "." + (filename.split(".").pop()?.toLowerCase() ?? "");
  return FILE_ROUTING_RULES.find((r) => r.extensions.includes(ext));
}

export function recommendModel(riskLevel: string): ProviderModel[] {
  if (riskLevel === "high") {
    return PROVIDERS.filter((p) => p.deployment === "local");
  }
  return PROVIDERS;
}

const STORAGE_KEY = "tokenfence-provider-configs";
const ALIAS_STORAGE_KEY = "tokenfence-provider-aliases";

export interface ModelAlias {
  provider: string;
  modelId: string;
  alias: string;
}

function storedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate one stored model alias.
 *
 * The slot is read back from storage, so it must be treated as untrusted: a
 * `null` entry or an entry without a provider reached the picker and broke the
 * lookup that matches an alias to its provider.
 */
function normalizeAlias(entry: unknown): ModelAlias | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const row = entry as Record<string, unknown>;
  const provider = storedText(row.provider);
  const modelId = storedText(row.modelId);
  const alias = storedText(row.alias);
  if (!provider || !modelId || !alias) return undefined;
  return { provider, modelId, alias };
}

export function loadModelAliases(): ModelAlias[] {
  try {
    const raw = storeGet(ALIAS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // A non-array payload used to be returned verbatim, so callers that treated
    // the result as a list (`.find`, `.map`, `.filter`) threw on the first use.
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAlias)
      .filter((entry): entry is ModelAlias => Boolean(entry));
  } catch { return []; }
}

export function saveModelAliases(aliases: ModelAlias[]): void {
  storeSet(ALIAS_STORAGE_KEY, JSON.stringify(aliases));
}

/**
 * Validate one stored provider configuration.
 *
 * `enabled` must stay a real boolean and the identity fields real strings:
 * a string `enabled` or a missing provider silently disabled routing decisions
 * that depend on the config being well formed.
 */
function normalizeProviderConfig(entry: unknown): ProviderConfig | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const row = entry as Record<string, unknown>;
  const provider = storedText(row.provider);
  if (!provider) return undefined;
  const model = storedText(row.model);
  const customModelId = storedText(row.customModelId);
  const status = storedText(row.lastHealthStatus);
  const validStatus = ["ok", "degraded", "failed", "unknown"].includes(status)
    ? (status as ProviderConfig["lastHealthStatus"])
    : "unknown";
  const lastHealthCheck = Number(row.lastHealthCheck);
  return {
    provider,
    model,
    customModelId: customModelId || undefined,
    apiKey: typeof row.apiKey === "string" ? row.apiKey : "",
    baseUrl: storedText(row.baseUrl),
    endpoint: storedText(row.endpoint),
    deployment: row.deployment === "local" ? "local" : "cloud",
    enabled: row.enabled === true,
    lastHealthCheck: Number.isFinite(lastHealthCheck) ? lastHealthCheck : undefined,
    lastHealthStatus: validStatus,
    lastHealthError: storedText(row.lastHealthError) || undefined,
  };
}

export function loadProviderConfigs(): ProviderConfig[] {
  const fallback = (): ProviderConfig[] => PROVIDERS.map((p) => ({
    provider: p.provider,
    model: p.model,
    customModelId: undefined,
    apiKey: "",
    baseUrl: PROVIDER_ENDPOINTS[p.provider]?.baseUrl ?? "",
    endpoint: PROVIDER_ENDPOINTS[p.provider]?.chatEndpoint ?? "/v1/chat/completions",
    deployment: p.deployment,
    enabled: false,
    lastHealthStatus: "unknown" as const,
  }));
  try {
    const raw = storeGet(STORAGE_KEY);
    if (!raw) return fallback();
    const parsed: unknown = JSON.parse(raw);
    // A non-array payload means the slot is unusable, so the documented
    // defaults are returned instead of handing callers an object or a number.
    if (!Array.isArray(parsed)) return fallback();
    const configs = parsed
      .map(normalizeProviderConfig)
      .filter((entry): entry is ProviderConfig => Boolean(entry));
    return configs.length > 0 ? configs : fallback();
  } catch {
    return fallback();
  }
}

export function saveProviderConfigs(configs: ProviderConfig[]): void {
  storeSet(STORAGE_KEY, JSON.stringify(configs));
}

export async function healthCheckProvider(config: ProviderConfig): Promise<ProviderConfig> {
  const start = Date.now();
  if (!config.apiKey && config.deployment === "cloud") {
    return { ...config, lastHealthCheck: start, lastHealthStatus: "failed", lastHealthError: "No API key configured" };
  }

  const endpoint = PROVIDER_ENDPOINTS[config.provider];
  if (!endpoint) {
    return { ...config, lastHealthCheck: start, lastHealthStatus: "failed", lastHealthError: "Unknown provider endpoint" };
  }

  try {
    const url = `${config.baseUrl || endpoint.baseUrl}${endpoint.modelsEndpoint}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) {
      if (config.provider === "Claude") {
        headers["x-api-key"] = config.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (config.provider === "Gemini") {
        headers["x-goog-api-key"] = config.apiKey;
      } else {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      return { ...config, lastHealthCheck: Date.now(), lastHealthStatus: "ok", lastHealthError: undefined };
    }
    if (resp.status === 401 || resp.status === 403) {
      return { ...config, lastHealthCheck: Date.now(), lastHealthStatus: "failed", lastHealthError: `Auth failed (${resp.status})` };
    }
    return { ...config, lastHealthCheck: Date.now(), lastHealthStatus: "degraded", lastHealthError: `HTTP ${resp.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("timeout")) {
      return { ...config, lastHealthCheck: Date.now(), lastHealthStatus: "degraded", lastHealthError: "Connection timeout" };
    }
    return { ...config, lastHealthCheck: Date.now(), lastHealthStatus: "failed", lastHealthError: msg };
  }
}

export function getProviderByModel(modelId: string): ProviderModel | undefined {
  return PROVIDERS.find((p) => p.model === modelId);
}

export function getProviderByName(name: string): ProviderModel | undefined {
  return PROVIDERS.find((p) => p.provider.toLowerCase() === name.toLowerCase());
}

// Token estimation helpers
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7F) tokens += 1 / 4;       // ASCII ~4 chars per token
    else if (code <= 0x7FF) tokens += 1 / 2;  // Latin extended
    else tokens += 2 / 3;                     // CJK ~1.5 chars per token
  }
  return Math.ceil(tokens);
}