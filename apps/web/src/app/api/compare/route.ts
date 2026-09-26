import { NextResponse } from "next/server";
import { guardPrompt } from "@/lib/core/guard";
import { analyzeIntent } from "@/lib/core/intent";
import { scoreRisk } from "@/lib/core/risk";
import { scanText } from "@/lib/core/scanner";
import { estimateTokens } from "@/lib/core/tokenizer";
import { callProvider } from "@/lib/providers";
import { findProvider } from "@/lib/providers/registry";
import { findSavedProvider } from "@/lib/vault/provider-config";
import type { GuardMode, PolicyId } from "@/lib/types";

type MatrixTarget = {
  providerId?: string;
  model?: string;
};

type MatrixFile = {
  id?: string;
  path?: string;
  content?: string;
  providerId?: string;
  model?: string;
  privacy?: "auto" | "public" | "private" | "secret";
};

type MatrixScope = "prompt" | "file";

type MatrixRun = {
  scope: MatrixScope;
  prompt: string;
  providerId: string;
  model?: string;
  filePath?: string;
  fileType?: string;
  privacy?: string;
  routingReason?: string;
};

export async function POST(request: Request) {
  const body = await request.json();
  const prompt = String(body.prompt || "");
  const targets = normalizeTargets(body.targets);
  const files = normalizeFiles(body.files);
  const policy = normalizePolicy(body.policy);
  const mode = normalizeMode(body.mode);
  const budget = Number(body.budget || 4000);
  const maxTokens = Number(body.maxTokens || 1000);

  if (!prompt.trim() && !files.length) {
    return NextResponse.json({ error: "prompt or files are required" }, { status: 400 });
  }

  const runs: MatrixRun[] = [];

  for (const target of targets) {
    if (!prompt.trim()) continue;
    runs.push({
      scope: "prompt",
      prompt,
      providerId: target.providerId || "",
      model: target.model
    });
  }

  for (const file of files) {
    const recommended = recommendFileTarget(file, prompt);
    const filePrompt = buildFilePrompt(prompt, file);
    runs.push({
      scope: "file",
      prompt: filePrompt,
      providerId: file.providerId || recommended.providerId,
      model: file.model || recommended.model,
      filePath: file.path || "untitled.txt",
      fileType: inferFileType(file.path || "untitled.txt", file.content || ""),
      privacy: file.privacy || "auto",
      routingReason: recommended.reason
    });
  }

  if (!runs.length) {
    return NextResponse.json({ error: "no runnable model targets were provided" }, { status: 400 });
  }

  const results = await Promise.all(runs.map((run) => executeRun(run, { policy, mode, budget, maxTokens })));
  return NextResponse.json({ results, count: results.length });
}

async function executeRun(
  run: MatrixRun,
  options: { policy: PolicyId; mode: GuardMode; budget: number; maxTokens: number }
) {
  const started = Date.now();
  const providerId = run.providerId;
  const saved = findSavedProvider(providerId);

  try {
    const intent = analyzeIntent(run.prompt);
    const guard = guardPrompt(run.prompt, {
      budget: options.budget,
      mode: options.mode,
      policy: options.policy,
      intent,
      providerId,
      model: run.model || saved?.model
    });

    const result = await callProvider(saved, {
      providerId,
      model: run.model || saved?.model,
      maxTokens: options.maxTokens,
      messages: [{ role: "user", content: guard.safePrompt }]
    });

    return {
      scope: run.scope,
      filePath: run.filePath,
      fileType: run.fileType,
      privacy: run.privacy,
      providerId,
      model: run.model || saved?.model,
      ok: true,
      text: result.text,
      usage: result.usage,
      durationMs: Date.now() - started,
      riskBefore: guard.riskBefore,
      riskAfter: guard.riskAfter,
      intent: intent.intent,
      effectiveMode: guard.effectiveMode,
      finalPrompt: guard.finalPrompt,
      routingReason: run.routingReason || guard.routing.reason
    };
  } catch (error) {
    return {
      scope: run.scope,
      filePath: run.filePath,
      fileType: run.fileType,
      privacy: run.privacy,
      providerId,
      model: run.model || saved?.model,
      ok: false,
      error: error instanceof Error ? error.message : "Failed",
      durationMs: Date.now() - started,
      routingReason: run.routingReason
    };
  }
}

function normalizeTargets(value: unknown): Required<MatrixTarget>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item as Partial<MatrixTarget>;
      return {
        providerId: String(record.providerId || "").trim(),
        model: String(record.model || "").trim()
      };
    })
    .filter((item) => item.providerId);
}

function normalizeFiles(value: unknown): Required<MatrixFile>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = item as Partial<MatrixFile>;
      return {
        id: String(record.id || `file-${index + 1}`),
        path: String(record.path || `file-${index + 1}.txt`).trim(),
        content: String(record.content || ""),
        providerId: String(record.providerId || "").trim(),
        model: String(record.model || "").trim(),
        privacy: normalizePrivacy(record.privacy)
      };
    })
    .filter((item) => item.content.trim());
}

function normalizePrivacy(value: unknown): "auto" | "public" | "private" | "secret" {
  if (value === "public" || value === "private" || value === "secret") return value;
  return "auto";
}

function normalizePolicy(value: unknown): PolicyId {
  if (value === "strict" || value === "balanced" || value === "fast" || value === "developer") return value;
  return "balanced";
}

function normalizeMode(value: unknown): GuardMode {
  if (value === "safe" || value === "compress-only" || value === "redact-only") return value;
  return "safe";
}

function recommendFileTarget(file: Required<MatrixFile>, task: string) {
  const content = file.content || "";
  const fileType = inferFileType(file.path, content);
  const risk = scoreRisk(scanText(`${file.path}\n${content}`));
  const secret = file.privacy === "secret" || risk.label === "critical" || risk.label === "high" || looksLikeSecretFile(file.path);

  if (secret) {
    return {
      providerId: "ollama",
      model: "llama3.1",
      reason: "This file looks sensitive or high-risk, so TokenFence recommends a local model."
    };
  }

  if (fileType === "code") {
    return {
      providerId: findProvider("deepseek") ? "deepseek" : "anthropic",
      model: "deepseek-chat",
      reason: "Code-like files are routed to a coding-friendly model by default."
    };
  }

  if (fileType === "markdown" || fileType === "document") {
    return {
      providerId: "openai",
      model: "gpt-4.1-mini",
      reason: "Documentation and writing files are routed to a cost-efficient general model."
    };
  }

  if (fileType === "log" || /debug|error|stack|trace/i.test(task)) {
    return {
      providerId: "gemini",
      model: "gemini-2.5-flash",
      reason: "Logs and long diagnostic context benefit from a long-context model."
    };
  }

  return {
    providerId: "openai",
    model: "gpt-4.1-mini",
    reason: "No strong file-specific rule matched, so a balanced default route is used."
  };
}

function inferFileType(path: string, content: string) {
  const lower = path.toLowerCase();
  if (/\.(tsx|ts|jsx|js|py|go|rs|java|cpp|c|cs|php|rb|swift|kt|sql|sh|yml|yaml|json)$/.test(lower)) return "code";
  if (/\.(md|mdx)$/.test(lower)) return "markdown";
  if (/\.(txt|doc|docx|pdf)$/.test(lower)) return "document";
  if (/\.(log|trace)$/.test(lower) || /error|exception|stack trace/i.test(content)) return "log";
  if (/\.(env|ini|conf|config)$/.test(lower)) return "config";
  return "text";
}

function looksLikeSecretFile(path: string) {
  const lower = path.toLowerCase();
  return lower.includes(".env") || lower.includes("secret") || lower.includes("credential") || lower.includes("private") || lower.includes("key");
}

function buildFilePrompt(task: string, file: Required<MatrixFile>) {
  const path = file.path || "untitled.txt";
  const content = file.content || "";
  const tokens = estimateTokens(content);

  return [
    "You are processing one file inside TokenFence Studio Model Matrix.",
    "Follow the task, focus only on the file below, and keep sensitive placeholders unchanged.",
    "",
    "## Task",
    task.trim() || "Analyze this file and provide useful findings.",
    "",
    "## File metadata",
    `Path: ${path}`,
    `Estimated tokens: ${tokens}`,
    `Privacy setting: ${file.privacy}`,
    "",
    "## File content",
    "```",
    content.slice(0, 50000),
    "```"
  ].join("\n");
}
