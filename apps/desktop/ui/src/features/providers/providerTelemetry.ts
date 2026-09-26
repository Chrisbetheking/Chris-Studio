export type ProviderErrorCategory =
  | "authentication"
  | "permission"
  | "rate-limit"
  | "quota"
  | "timeout"
  | "network"
  | "invalid-request"
  | "server"
  | "cancelled"
  | "unknown";

export interface ProviderUsageRateCard {
  inputUsdPerMillion?: number;
  outputUsdPerMillion?: number;
  cachedInputUsdPerMillion?: number;
  reasoningUsdPerMillion?: number;
}

export interface NormalizedProviderUsage {
  provider: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd?: number;
  source: "reported" | "partial" | "unavailable";
}

export interface NormalizedProviderError {
  provider: string;
  category: ProviderErrorCategory;
  code?: string;
  httpStatus?: number;
  retryable: boolean;
  retryAfterMs?: number;
  safeMessage: string;
}

type UnknownRecord = Record<string, unknown>;

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(api[_ -]?key|token|password)\s*[:=]\s*[^\s,;]+/gi,
];

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function finiteNonNegative(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function firstNumber(records: UnknownRecord[], keys: string[]): number {
  for (const record of records) {
    for (const key of keys) {
      const value = finiteNonNegative(record[key]);
      if (value > 0) return value;
    }
  }
  return 0;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampRetryAfter(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  // Values below 1,000 are commonly expressed in seconds by provider SDKs.
  return Math.min(24 * 60 * 60 * 1000, numeric < 1000 ? numeric * 1000 : numeric);
}

export function sanitizeProviderMessage(message: unknown): string {
  let text = optionalText(message) ?? "Provider request failed.";
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text.slice(0, 1000);
}

export function normalizeProviderUsage(
  provider: string,
  rawUsage: unknown,
  options: { model?: string; rateCard?: ProviderUsageRateCard } = {},
): NormalizedProviderUsage {
  const root = asRecord(rawUsage);
  const details = [
    root,
    asRecord(root.usage),
    asRecord(root.token_usage),
    asRecord(root.usage_metadata),
    asRecord(root.input_tokens_details),
    asRecord(root.output_tokens_details),
  ];

  const inputTokens = firstNumber(details, [
    "input_tokens",
    "prompt_tokens",
    "promptTokenCount",
    "inputTokenCount",
  ]);
  const outputTokens = firstNumber(details, [
    "output_tokens",
    "completion_tokens",
    "candidatesTokenCount",
    "outputTokenCount",
  ]);
  const reportedTotal = firstNumber(details, ["total_tokens", "totalTokenCount"]);
  const cachedInputTokens = firstNumber(details, [
    "cached_tokens",
    "cache_read_input_tokens",
    "cached_input_tokens",
    "cacheReadInputTokens",
  ]);
  const reasoningTokens = firstNumber(details, [
    "reasoning_tokens",
    "thinking_tokens",
    "reasoningTokenCount",
  ]);
  const totalTokens = Math.max(reportedTotal, inputTokens + outputTokens);
  const hasAny = totalTokens > 0 || cachedInputTokens > 0 || reasoningTokens > 0;
  const source: NormalizedProviderUsage["source"] = !hasAny
    ? "unavailable"
    : inputTokens > 0 && outputTokens > 0
      ? "reported"
      : "partial";

  const rateCard = options.rateCard;
  let estimatedCostUsd: number | undefined;
  if (rateCard && hasAny) {
    const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);
    estimatedCostUsd =
      (uncachedInput * (rateCard.inputUsdPerMillion ?? 0) +
        outputTokens * (rateCard.outputUsdPerMillion ?? 0) +
        cachedInputTokens * (rateCard.cachedInputUsdPerMillion ?? rateCard.inputUsdPerMillion ?? 0) +
        reasoningTokens * (rateCard.reasoningUsdPerMillion ?? rateCard.outputUsdPerMillion ?? 0)) /
      1_000_000;
    estimatedCostUsd = Number(estimatedCostUsd.toFixed(8));
  }

  return {
    provider: provider.trim() || "unknown",
    model: optionalText(options.model),
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    estimatedCostUsd,
    source,
  };
}

export function normalizeProviderError(
  provider: string,
  error: unknown,
  context: { httpStatus?: number; retryAfterMs?: number } = {},
): NormalizedProviderError {
  const record = asRecord(error);
  const nested = asRecord(record.error);
  const status = finiteNonNegative(context.httpStatus ?? record.status ?? record.statusCode ?? nested.status) || undefined;
  const code = optionalText(record.code ?? nested.code ?? record.type ?? nested.type);
  const message = sanitizeProviderMessage(record.message ?? nested.message ?? error);
  const haystack = `${code ?? ""} ${message}`.toLowerCase();
  let category: ProviderErrorCategory = "unknown";

  if (haystack.includes("abort") || haystack.includes("cancel")) category = "cancelled";
  else if (status === 401 || haystack.includes("unauthorized") || haystack.includes("invalid api key")) category = "authentication";
  else if (status === 403 || haystack.includes("forbidden") || haystack.includes("permission")) category = "permission";
  else if (status === 429 || haystack.includes("rate limit") || haystack.includes("too many requests")) category = "rate-limit";
  else if (haystack.includes("quota") || haystack.includes("insufficient_quota") || haystack.includes("billing")) category = "quota";
  else if (status === 408 || status === 504 || haystack.includes("timeout") || haystack.includes("timed out")) category = "timeout";
  else if (haystack.includes("network") || haystack.includes("fetch failed") || haystack.includes("connection")) category = "network";
  else if ((status !== undefined && status >= 400 && status < 500) || haystack.includes("invalid request")) category = "invalid-request";
  else if ((status !== undefined && status >= 500) || haystack.includes("server error")) category = "server";

  const retryable = ["rate-limit", "timeout", "network", "server"].includes(category);
  const retryAfterMs = clampRetryAfter(
    context.retryAfterMs ?? record.retryAfterMs ?? record.retry_after_ms ?? record.retry_after,
  );

  return {
    provider: provider.trim() || "unknown",
    category,
    code,
    httpStatus: status,
    retryable,
    retryAfterMs,
    safeMessage: message,
  };
}
