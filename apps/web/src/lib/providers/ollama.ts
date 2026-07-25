import type { ProviderCall, ProviderResult, ProviderSpec, SavedProvider } from "../types";

export async function callOllama(spec: ProviderSpec, saved: SavedProvider | undefined, call: ProviderCall): Promise<ProviderResult> {
  const baseUrl = (saved?.baseUrl || spec.baseUrl).replace(/\/$/, "");
  const model = call.model || saved?.model || spec.defaultModel;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: call.messages,
      stream: false,
      options: {
        temperature: call.temperature ?? 0.3,
        num_predict: call.maxTokens ?? 1200
      }
    })
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return {
    text: data.message?.content || "",
    usage: {
      input: data.prompt_eval_count,
      output: data.eval_count,
      total: (data.prompt_eval_count || 0) + (data.eval_count || 0)
    },
    raw: data
  };
}
