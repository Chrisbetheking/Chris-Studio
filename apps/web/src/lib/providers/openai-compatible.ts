import type { ProviderCall, ProviderResult, SavedProvider } from "../types";
import type { ProviderSpec } from "../types";

export async function callOpenAICompatible(spec: ProviderSpec, saved: SavedProvider | undefined, call: ProviderCall): Promise<ProviderResult> {
  const baseUrl = trimSlash(saved?.baseUrl || spec.baseUrl);
  const apiKey = saved?.apiKey || process.env[spec.keyEnv || ""] || "";
  const model = call.model || saved?.model || spec.defaultModel;

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (spec.id === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "TokenFence Studio";
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: call.messages,
      temperature: call.temperature ?? 0.3,
      max_tokens: call.maxTokens ?? 1200
    })
  });

  if (!response.ok) {
    throw new Error(await cleanError(response));
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";

  return {
    text,
    usage: {
      input: data.usage?.prompt_tokens,
      output: data.usage?.completion_tokens,
      total: data.usage?.total_tokens
    },
    raw: data
  };
}

export async function testOpenAICompatible(spec: ProviderSpec, saved: SavedProvider | undefined) {
  const result = await callOpenAICompatible(spec, saved, {
    providerId: spec.id,
    model: saved?.model || spec.defaultModel,
    maxTokens: 8,
    messages: [{ role: "user", content: "Reply with ok." }]
  });

  return result.text.length > 0;
}

function trimSlash(value: string) {
  return value.replace(/\/$/, "");
}

async function cleanError(response: Response) {
  const text = await response.text();
  return `${response.status} ${response.statusText}: ${text.slice(0, 500)}`;
}
