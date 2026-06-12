/* Model Auto Router by Task Type + Fallback Chains */
import { storeGet, storeSet } from "../agent-runtime/safeStorage";

export type TaskCategory = "general" | "code" | "document" | "creative" | "analysis" | "safety" | "agent";

export interface RouterRule {
  taskCategory: TaskCategory;
  primaryProvider: string;
  primaryModel: string;
  fallbackChain: string[];
  localPreferred: boolean;
}

export interface RoutingDecision {
  provider: string;
  model: string;
  isFallback: boolean;
  fallbackIndex: number;
  reason: string;
}

const DEFAULT_RULES: RouterRule[] = [
  { taskCategory: "general", primaryProvider: "OpenAI", primaryModel: "gpt-4o", fallbackChain: ["Gemini/gemini-2.0-flash", "Ollama/llama3.2"], localPreferred: false },
  { taskCategory: "code", primaryProvider: "Anthropic", primaryModel: "claude-sonnet-4-20250514", fallbackChain: ["OpenAI/gpt-4o", "Ollama/deepseek-coder-v2"], localPreferred: false },
  { taskCategory: "document", primaryProvider: "OpenAI", primaryModel: "gpt-4o-mini", fallbackChain: ["Gemini/gemini-1.5-flash", "Ollama/llama3.2"], localPreferred: false },
  { taskCategory: "creative", primaryProvider: "Anthropic", primaryModel: "claude-sonnet-4-20250514", fallbackChain: ["OpenAI/gpt-4o", "Gemini/gemini-2.0-flash"], localPreferred: false },
  { taskCategory: "analysis", primaryProvider: "OpenAI", primaryModel: "gpt-4o", fallbackChain: ["Anthropic/claude-sonnet-4-20250514", "Ollama/llama3.2"], localPreferred: true },
  { taskCategory: "safety", primaryProvider: "Ollama", primaryModel: "llama3.2", fallbackChain: ["OpenAI/gpt-4o-mini"], localPreferred: true },
  { taskCategory: "agent", primaryProvider: "Anthropic", primaryModel: "claude-sonnet-4-20250514", fallbackChain: ["OpenAI/gpt-4o", "Gemini/gemini-2.0-flash", "Ollama/llama3.2"], localPreferred: false },
];

let customRules: RouterRule[] = [...DEFAULT_RULES];

export function getRouterRules(): RouterRule[] { return customRules; }

export function setRouterRules(rules: RouterRule[]): void {
  customRules = rules;
  try { storeSet("tokenfence.router-rules", JSON.stringify(rules)); } catch { /* */ }
}

export function loadRouterRules(): void {
  try {
    const raw = storeGet("tokenfence.router-rules");
    if (raw) customRules = JSON.parse(raw);
  } catch { /* */ }
}

const unhealthyProviders = new Set<string>();

export function markProviderUnhealthy(providerId: string): void { unhealthyProviders.add(providerId); }
export function markProviderHealthy(providerId: string): void { unhealthyProviders.delete(providerId); }

export function routeTask(category: TaskCategory): RoutingDecision {
  const rule = customRules.find((r) => r.taskCategory === category) || customRules[0];
  if (!unhealthyProviders.has(rule.primaryProvider)) {
    return { provider: rule.primaryProvider, model: rule.primaryModel, isFallback: false, fallbackIndex: 0, reason: `Primary route for ${category}` };
  }
  for (let i = 0; i < rule.fallbackChain.length; i++) {
    const [provider, model] = rule.fallbackChain[i].split("/");
    if (!unhealthyProviders.has(provider)) {
      return { provider, model, isFallback: true, fallbackIndex: i + 1, reason: `Fallback #${i + 1} for ${category}` };
    }
  }
  return { provider: "Ollama", model: "llama3.2", isFallback: true, fallbackIndex: rule.fallbackChain.length + 1, reason: "Last resort local fallback" };
}