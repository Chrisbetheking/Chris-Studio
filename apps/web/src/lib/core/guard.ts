import type { GuardMode, GuardResult, IntentReport, PolicyId, RiskScore, RoutingDecision, SkillContext } from "../types";
import { compressPrompt } from "./compressor";
import { redactText } from "./redactor";
import { scoreRisk } from "./risk";
import { scanText } from "./scanner";
import { estimateTokens, tokenDelta } from "./tokenizer";

type GuardOptions = {
  question?: string;
  budget?: number;
  mode?: GuardMode;
  policy?: PolicyId;
  intent?: IntentReport;
  skills?: SkillContext[];
  providerId?: string;
  model?: string;
};

const localProviders = new Set(["ollama", "lmstudio", "local", "custom-local"]);

export function guardPrompt(input: string, options: GuardOptions = {}): GuardResult {
  const policy = options.policy || "balanced";
  const requestedMode = options.mode || "safe";
  const detections = scanText(input);
  const riskBefore = scoreRisk(detections);
  const effectiveMode = chooseEffectiveMode(requestedMode, policy, riskBefore);
  const redacted = redactText(input, detections);

  const base = effectiveMode === "compress-only" ? input : redacted.text;
  const compressed = effectiveMode === "redact-only" ? base : compressPrompt(base, options);

  const safePrompt = buildSafePrompt({
    context: compressed,
    question: options.question,
    intent: options.intent,
    skills: options.skills || [],
    policy,
    effectiveMode
  });
  const afterDetections = scanText(safePrompt);
  const tokensBefore = estimateTokens(input);
  const tokensAfter = estimateTokens(safePrompt);
  const riskAfter = scoreRisk(afterDetections);
  const routing = recommendRouting({
    riskBefore,
    riskAfter,
    intent: options.intent,
    providerId: options.providerId,
    model: options.model,
    policy
  });
  const action = recommendAction({ policy, requestedMode, effectiveMode, riskBefore, riskAfter, routing });

  return {
    original: input,
    redacted: redacted.text,
    compressed,
    safePrompt,
    finalPrompt: safePrompt,
    detections,
    mapping: redacted.mapping,
    riskBefore,
    riskAfter,
    tokensBefore,
    tokensAfter,
    savedPercent: tokenDelta(tokensBefore, tokensAfter),
    intent: options.intent,
    skills: options.skills || [],
    policy,
    mode: requestedMode,
    effectiveMode,
    routing,
    action,
    compression: {
      originalTokens: tokensBefore,
      finalTokens: tokensAfter,
      savedPercent: tokenDelta(tokensBefore, tokensAfter),
      budget: options.budget || 4000,
      applied: effectiveMode !== "redact-only" && tokensAfter < tokensBefore
    }
  };
}

function chooseEffectiveMode(requested: GuardMode, policy: PolicyId, risk: RiskScore): GuardMode {
  if (policy === "strict") return "safe";

  // Never let high-risk secrets go out through a raw compression-only path by accident.
  if ((risk.label === "critical" || risk.label === "high") && requested === "compress-only") {
    return policy === "fast" ? "redact-only" : "safe";
  }

  if (policy === "fast" && risk.label === "low") return "compress-only";
  return requested;
}

function recommendRouting({
  riskBefore,
  riskAfter,
  intent,
  providerId,
  model,
  policy
}: {
  riskBefore: RiskScore;
  riskAfter: RiskScore;
  intent?: IntentReport;
  providerId?: string;
  model?: string;
  policy: PolicyId;
}): RoutingDecision {
  const currentProviderIsLocal = providerId ? localProviders.has(providerId) : false;
  const highRisk = riskBefore.label === "critical" || riskBefore.label === "high";
  const sensitiveIntent = Boolean(intent?.sensitiveByNature);

  if ((policy === "strict" || highRisk || sensitiveIntent) && !currentProviderIsLocal) {
    return {
      label: "Prefer local or redacted cloud request",
      providerId: "ollama",
      model: "llama3.1",
      localPreferred: true,
      confidence: highRisk ? 0.92 : 0.78,
      reason: highRisk
        ? "High-risk secrets were detected before redaction. A local model or the redacted final prompt is safer than a raw cloud request."
        : "This task may contain personal or private information, so a local model is preferred when available."
    };
  }

  if (intent?.intent === "code") {
    return {
      label: "Coding-optimized model",
      providerId: providerId || "anthropic",
      model: model || "claude-3-5-sonnet-latest",
      localPreferred: false,
      confidence: 0.82,
      reason: "The prompt looks like code, logs, errors, or repository context. A coding-optimized model is recommended."
    };
  }

  if (intent?.intent === "summarize") {
    return {
      label: "Cost-efficient summarization",
      providerId: providerId || "openai",
      model: model || "gpt-4.1-mini",
      localPreferred: false,
      confidence: 0.76,
      reason: "Summarization usually benefits from a cheaper or local model after context compression."
    };
  }

  if (riskAfter.label === "low" && providerId) {
    return {
      label: "Selected model is acceptable",
      providerId,
      model: model || "default",
      localPreferred: false,
      confidence: 0.68,
      reason: "The final prompt has low residual risk after TokenFence processing."
    };
  }

  return {
    label: "Default route",
    providerId: providerId || "openai",
    model: model || "gpt-4.1-mini",
    localPreferred: false,
    confidence: 0.58,
    reason: "No stronger routing rule matched, so the selected/default model can be used."
  };
}

function recommendAction({
  policy,
  requestedMode,
  effectiveMode,
  riskBefore,
  riskAfter,
  routing
}: {
  policy: PolicyId;
  requestedMode: GuardMode;
  effectiveMode: GuardMode;
  riskBefore: RiskScore;
  riskAfter: RiskScore;
  routing: RoutingDecision;
}) {
  if (requestedMode !== effectiveMode) {
    return {
      label: "Mode upgraded for safety",
      reason: `Requested mode '${requestedMode}' was upgraded to '${effectiveMode}' because the prompt contained ${riskBefore.label}-risk data.`,
      blocked: false,
      requiresConfirmation: riskBefore.label === "critical"
    };
  }

  if (routing.localPreferred) {
    return {
      label: "Send redacted prompt / prefer local model",
      reason: routing.reason,
      blocked: false,
      requiresConfirmation: policy === "strict" || riskBefore.label === "critical"
    };
  }

  if (riskAfter.label === "low") {
    return {
      label: "Safe to send final prompt",
      reason: "The final prompt has low residual risk after redaction and/or compression.",
      blocked: false,
      requiresConfirmation: false
    };
  }

  return {
    label: "Review before sending",
    reason: "Some medium-risk information may remain in the final prompt. Review the preview before sending.",
    blocked: false,
    requiresConfirmation: true
  };
}

function buildSafePrompt({
  context,
  question,
  intent,
  skills,
  policy,
  effectiveMode
}: {
  context: string;
  question?: string;
  intent?: IntentReport;
  skills: SkillContext[];
  policy: PolicyId;
  effectiveMode: GuardMode;
}) {
  const parts = [
    "You are answering a user request after a local safety and context pass.",
    "Preserve the user's original intent. Do not over-summarize away the ask.",
    "Keep redaction placeholders such as [EMAIL_1], [PHONE_LABEL_1], [ID_LABEL_1], [NAME_CN_1] unchanged.",
    "If live/tool context is provided, use it instead of model memory. If tool context failed, say so plainly.",
    `TokenFence policy: ${policy}. Effective prompt mode: ${effectiveMode}.`
  ];

  if (intent) {
    parts.push(
      "",
      "## Intent detected by TokenFence",
      `Intent: ${intent.intent}`,
      `Confidence: ${Math.round(intent.confidence * 100)}%`,
      `Language: ${intent.language}`,
      `Needs realtime data: ${intent.needsRealtime ? "yes" : "no"}`,
      intent.entities.location ? `Location: ${intent.entities.location}` : "",
      intent.hints.length ? `Hints: ${intent.hints.join(" ")}` : ""
    );
  }

  const usableSkills = skills.filter(Boolean);
  if (usableSkills.length) {
    parts.push("", "## Collected context");
    for (const skill of usableSkills) {
      parts.push(`### ${skill.title}`, `Status: ${skill.status}`, skill.source ? `Source: ${skill.source}` : "", skill.content.trim());
    }
  }

  parts.push("", "## Sanitized user context", context.trim());

  if (question?.trim()) {
    parts.push("", "## Explicit task", question.trim());
  }

  parts.push(
    "",
    "## Response style",
    "Answer directly. If the user wrote Chinese, answer in Chinese. If the user wrote English, answer in English. Be practical and do not mention TokenFence unless it matters."
  );

  return parts.filter((line) => line !== "").join("\n").trim();
}
