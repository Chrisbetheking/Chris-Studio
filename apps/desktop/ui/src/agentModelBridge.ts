// Agent model bridge: calls the currently configured model to generate Agent plans and diffs.
// Uses the same provider pattern as ChatWorkspace.

interface ModelConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  customModelId?: string;
  deployment?: string;
}

interface ProviderEndpoint {
  baseUrl: string;
  chatEndpoint: string;
}

const PROVIDER_ENDPOINTS: Record<string, ProviderEndpoint> = {
  OpenAI: { baseUrl: "https://api.openai.com", chatEndpoint: "/v1/chat/completions" },
  Claude: { baseUrl: "https://api.anthropic.com", chatEndpoint: "/v1/messages" },
  Gemini: { baseUrl: "https://generativelanguage.googleapis.com", chatEndpoint: "/v1beta/models/{model}:generateContent" },
  DeepSeek: { baseUrl: "https://api.deepseek.com", chatEndpoint: "/v1/chat/completions" },
  Grok: { baseUrl: "https://api.x.ai", chatEndpoint: "/v1/chat/completions" },
  Ollama: { baseUrl: "http://localhost:11434", chatEndpoint: "/api/chat" },
  LMStudio: { baseUrl: "http://localhost:1234", chatEndpoint: "/v1/chat/completions" },
  OpenRouter: { baseUrl: "https://openrouter.ai/api", chatEndpoint: "/v1/chat/completions" },
};

export async function generateAgentPlan(
  userRequest: string,
  fileContents: { name: string; content: string }[]
): Promise<string> {
  // Read model config from localStorage (same key as ChatWorkspace)
  let config: ModelConfig;
  try {
    const raw = localStorage.getItem("tokenfence-chat-config");
    config = raw ? JSON.parse(raw) : { provider: "OpenAI" };
  } catch {
    return "[Error] Model not configured. Please set up an API Key in Models page.";
  }

  const ep = PROVIDER_ENDPOINTS[config.provider] || PROVIDER_ENDPOINTS["OpenAI"];
  if (!config.apiKey && config.deployment === "cloud") {
    return "[Error] Model not configured. Please configure an API Key for " + config.provider + " in Models page.";
  }
  if (!config.apiKey) {
    return "[Error] Model not configured. Please configure an API Key for " + config.provider + " in Models page.";
  }

  const mid = config.customModelId || config.model || "gpt-3.5-turbo";
  const url = (config.baseUrl || ep.baseUrl) + ep.chatEndpoint.replace("{model}", mid);

  // Build system + user prompt for Agent plan generation
  const systemPrompt = `You are an expert code editor. Given file contents and a user request, produce:
1. A concise Plan (3-5 bullet points)
2. A list of Changed Files
3. A Unified Diff for each file
4. Risk Notes (1-2 lines)

Format your response as:
## Plan
- point 1
- point 2

## Changed Files
- file1.ts
- file2.ts

## Unified Diff
\`\`\`diff
--- a/file.ts
+++ b/file.ts
@@ -1,5 +1,5 @@
-old
+new
\`\`\`

## Risk Notes
- risk note here`;

  const fileBlock = fileContents.map(f => `### ${f.name}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``).join("\n\n");
  const userMessage = `User Request: ${userRequest}\n\nFiles:\n${fileBlock}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.provider === "Claude") {
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (config.provider === "Gemini") {
      headers["x-goog-api-key"] = config.apiKey;
    } else {
      headers["Authorization"] = "Bearer " + config.apiKey;
    }

    let body: Record<string, unknown>;
    if (config.provider === "Claude") {
      body = { model: mid, max_tokens: 2048, messages: messages.map(m => ({ role: m.role, content: m.content })) };
    } else if (config.provider === "Gemini") {
      body = { contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
    } else {
      body = { model: mid, messages, max_tokens: 2048 };
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(t);

    if (!resp.ok) {
      const errText = await resp.text();
      return "[Error] Model API returned " + resp.status + ": " + errText.slice(0, 200);
    }

    const data = await resp.json();
    if (config.provider === "Claude") {
      return data?.content?.[0]?.text || "[Error] Empty response from model.";
    } else if (config.provider === "Gemini") {
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[Error] Empty response from model.";
    } else {
      return data?.choices?.[0]?.message?.content || "[Error] Empty response from model.";
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      return "[Error] Model request timed out (30s). Try again.";
    }
    return "[Error] Model call failed: " + String(e.message || e);
  }
}
