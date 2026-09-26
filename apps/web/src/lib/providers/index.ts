import type { ProviderCall, ProviderResult, SavedProvider } from "../types";
import { findProvider } from "./registry";
import { callAnthropic } from "./anthropic";
import { callGemini } from "./gemini";
import { callOllama } from "./ollama";
import { callOpenAICompatible } from "./openai-compatible";

export async function callProvider(saved: SavedProvider | undefined, call: ProviderCall): Promise<ProviderResult> {
  const spec = findProvider(call.providerId);
  if (!spec) throw new Error(`Unknown provider: ${call.providerId}`);

  if (spec.needsKey && !saved?.apiKey && !process.env[spec.keyEnv || ""]) {
    throw new Error(`Missing API key for ${spec.label}. Save it in Providers first.`);
  }

  if (spec.kind === "anthropic") return callAnthropic(spec, saved, call);
  if (spec.kind === "gemini") return callGemini(spec, saved, call);
  if (spec.kind === "ollama") return callOllama(spec, saved, call);
  return callOpenAICompatible(spec, saved, call);
}
