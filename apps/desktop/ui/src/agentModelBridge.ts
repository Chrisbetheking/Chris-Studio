// Agent model bridge v1.2.3
// Calls the currently configured model to generate Agent plans and unified diffs.
// Reads model config from localStorage (same key as ChatWorkspace).

interface ModelConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  customModelId?: string;
  deployment?: string;
}

const PROVIDERS: Record<string, { baseUrl: string; chatPath: string }> = {
  OpenAI:       { baseUrl: "https://api.openai.com",                   chatPath: "/v1/chat/completions" },
  DeepSeek:     { baseUrl: "https://api.deepseek.com",                 chatPath: "/v1/chat/completions" },
  OpenRouter:   { baseUrl: "https://openrouter.ai/api",                chatPath: "/v1/chat/completions" },
  Grok:         { baseUrl: "https://api.x.ai",                         chatPath: "/v1/chat/completions" },
  Claude:       { baseUrl: "https://api.anthropic.com",                chatPath: "/v1/messages" },
  Gemini:       { baseUrl: "https://generativelanguage.googleapis.com", chatPath: "/v1beta/models/{model}:generateContent" },
  Ollama:       { baseUrl: "http://localhost:11434",                    chatPath: "/api/chat" },
  LMStudio:     { baseUrl: "http://localhost:1234",                     chatPath: "/v1/chat/completions" },
};

function loadConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem("tokenfence-chat-config");
    return raw ? JSON.parse(raw) : { provider: "OpenAI" };
  } catch {
    return { provider: "OpenAI" };
  }
}

function buildSystemPrompt(): string {
  return `You are an expert code editor. Given file contents and a user request, produce exactly:

## Plan
- bullet points (3-5)

## Changed Files
- file1
- file2

## Unified Diff
\`\`\`diff
--- a/file
+++ b/file
@@ -line,count +line,count @@
-old
+new
\`\`\`

## Risk Notes
- one or two notes`;
}

export async function generateAgentPlan(
  userRequest: string,
  fileContents: { name: string; content: string }[]
): Promise<string> {
  const config = loadConfig();
  const prov = PROVIDERS[config.provider] || PROVIDERS["OpenAI"];

  if (!config.apiKey) {
    return "[Error] Model not configured. Please set an API Key for " + config.provider + " in Models page.";
  }

  const modelId = config.customModelId || config.model || "gpt-3.5-turbo";
  const url = (config.baseUrl || prov.baseUrl) + prov.chatPath.replace("{model}", modelId);

  const systemPrompt = buildSystemPrompt();
  const fileBlock = fileContents
    .map(function(f) { return "### " + f.name + "\n```\n" + f.content.slice(0, 3000) + "\n```"; })
    .join("\n\n");
  const userMessage = "User Request: " + userRequest + "\n\nFiles:\n" + fileBlock;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: userMessage },
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
      body = { model: modelId, max_tokens: 2048, messages: messages.map(function(m) { return { role: m.role, content: m.content }; }) };
    } else if (config.provider === "Gemini") {
      body = { contents: messages.map(function(m) { return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }; }) };
    } else {
      body = { model: modelId, messages: messages, max_tokens: 2048 };
    }

    const ctrl = new AbortController();
    const t = setTimeout(function() { ctrl.abort(); }, 30000);
    const resp = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(t);

    if (!resp.ok) {
      const errText = await resp.text();
      return "[Error] API returned " + resp.status + ": " + errText.slice(0, 200);
    }

    const data = await resp.json();

    if (config.provider === "Claude") {
      return data?.content?.[0]?.text || "[Error] Empty response from Claude.";
    }
    if (config.provider === "Gemini") {
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[Error] Empty response from Gemini.";
    }
    // OpenAI-compatible (OpenAI, DeepSeek, OpenRouter, Grok, Ollama, LMStudio)
    return data?.choices?.[0]?.message?.content || "[Error] Empty response from model.";

  } catch (e: any) {
    if (e.name === "AbortError") {
      return "[Error] Request timed out (30s).";
    }
    return "[Error] Model call failed: " + String(e.message || e);
  }
}

// Note: CORS restrictions apply in browser context.
// Desktop (Tauri) may need the Tauri HTTP plugin for production use.
