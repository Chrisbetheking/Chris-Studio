import type { ChatMessage, ProviderCall, ProviderResult, ProviderSpec, SavedProvider } from "../types";

export async function callGemini(spec: ProviderSpec, saved: SavedProvider | undefined, call: ProviderCall): Promise<ProviderResult> {
  const apiKey = saved?.apiKey || process.env[spec.keyEnv || ""] || "";
  if (!apiKey) throw new Error("Missing Gemini API key.");

  const model = call.model || saved?.model || spec.defaultModel;
  const url = `${spec.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: toGeminiContents(call.messages),
      generationConfig: {
        temperature: call.temperature ?? 0.3,
        maxOutputTokens: call.maxTokens ?? 1200
      }
    })
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  return {
    text,
    usage: {
      input: data.usageMetadata?.promptTokenCount,
      output: data.usageMetadata?.candidatesTokenCount,
      total: data.usageMetadata?.totalTokenCount
    },
    raw: data
  };
}

function toGeminiContents(messages: ChatMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  return messages
    .filter((message) => message.role !== "system")
    .map((message, index) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: index === 0 && system ? `${system}\n\n${message.content}` : message.content }]
    }));
}
