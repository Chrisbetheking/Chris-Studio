import type { ChatMessage, ProviderCall, ProviderResult, ProviderSpec, SavedProvider } from "../types";

export async function callAnthropic(spec: ProviderSpec, saved: SavedProvider | undefined, call: ProviderCall): Promise<ProviderResult> {
  const apiKey = saved?.apiKey || process.env[spec.keyEnv || ""] || "";
  if (!apiKey) throw new Error("Missing Anthropic API key.");

  const model = call.model || saved?.model || spec.defaultModel;
  const { system, messages } = splitSystem(call.messages);

  const response = await fetch(`${spec.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      system,
      messages,
      max_tokens: call.maxTokens ?? 1200,
      temperature: call.temperature ?? 0.3
    })
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  const text = (data.content || [])
    .filter((part: { type: string }) => part.type === "text")
    .map((part: { text: string }) => part.text)
    .join("\n")
    .trim();

  return {
    text,
    usage: {
      input: data.usage?.input_tokens,
      output: data.usage?.output_tokens,
      total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    },
    raw: data
  };
}

function splitSystem(messages: ChatMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const rest = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));

  return { system: system || undefined, messages: rest };
}
