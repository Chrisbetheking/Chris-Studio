import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/types";
import { guardPrompt } from "@/lib/core/guard";
import { analyzeIntent } from "@/lib/core/intent";
import { estimateTokens } from "@/lib/core/tokenizer";
import { callProvider } from "@/lib/providers";
import { collectSkillContexts } from "@/lib/skills";
import { addArchive } from "@/lib/vault/archive";
import { findSavedProvider } from "@/lib/vault/provider-config";
import { saveRedactionMap } from "@/lib/vault/redaction-vault";

export async function POST(request: Request) {
  const body = await request.json();
  const providerId = String(body.providerId || "");
  const model = String(body.model || "");
  const prompt = String(body.prompt || "");
  const system = String(body.system || "");
  const history = Array.isArray(body.history) ? body.history : [];
  const budget = Number(body.budget || 4000);
  const mode = body.mode || "safe";
  const policy = body.policy || "balanced";

  if (!providerId || !prompt.trim()) {
    return NextResponse.json({ error: "providerId and prompt are required" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const saved = findSavedProvider(providerId);
    const intent = analyzeIntent(prompt);
    const skills = await collectSkillContexts(intent);
    const guard = guardPrompt(prompt, { budget, question: body.question, mode, policy, intent, skills, providerId, model: model || saved?.model });
    saveRedactionMap(guard.mapping, { providerId, model: model || saved?.model || "" });

    const messages: ChatMessage[] = [];
    if (system.trim()) messages.push({ role: "system", content: system.trim() });
    for (const item of history.slice(-8)) {
      if ((item?.role === "user" || item?.role === "assistant") && typeof item.content === "string") {
        messages.push({ role: item.role, content: item.content.slice(0, 8000) });
      }
    }
    messages.push({ role: "user", content: guard.safePrompt });

    let answer = "";
    let usage: { input?: number; output?: number; total?: number } | undefined;

    try {
      const result = await callProvider(saved, {
        providerId,
        model: model || saved?.model,
        messages,
        temperature: Number(body.temperature ?? 0.3),
        maxTokens: Number(body.maxTokens || 1200)
      });
      answer = result.text;
      usage = result.usage;
    } catch (error) {
      const directSkillAnswer = skills.find((skill) => skill.directAnswer)?.directAnswer;
      if (!directSkillAnswer) throw error;
      answer = directSkillAnswer;
      usage = { input: guard.tokensAfter, output: estimateTokens(answer), total: guard.tokensAfter + estimateTokens(answer) };
    }

    const durationMs = Date.now() - started;
    const archive = addArchive({
      title: titleFromPrompt(prompt),
      providerId,
      model: model || saved?.model || "default",
      promptBefore: prompt,
      promptAfter: guard.safePrompt,
      response: answer,
      tokensInput: usage?.input || guard.tokensAfter,
      tokensOutput: usage?.output || estimateTokens(answer),
      riskBefore: guard.riskBefore,
      riskAfter: guard.riskAfter,
      durationMs,
      tags: [intent.intent, ...(body.tags || [])]
    });

    return NextResponse.json({ answer, guard, intent, skills, usage, durationMs, archiveId: archive.id });
  } catch (error) {
    const durationMs = Date.now() - started;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Model call failed", durationMs }, { status: 500 });
  }
}

function titleFromPrompt(prompt: string) {
  const first = prompt.split("\n").map((line) => line.trim()).find(Boolean) || "Untitled run";
  return first.length > 70 ? `${first.slice(0, 67)}...` : first;
}
