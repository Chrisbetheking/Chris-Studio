import { NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { findSavedProvider } from "@/lib/vault/provider-config";

export async function POST(request: Request) {
  const body = await request.json();
  const providerId = String(body.providerId || "");
  const model = String(body.model || "");

  try {
    const saved = findSavedProvider(providerId);
    const started = Date.now();
    const result = await callProvider(saved, {
      providerId,
      model: model || saved?.model,
      maxTokens: 12,
      messages: [{ role: "user", content: "Reply with ok." }]
    });

    return NextResponse.json({ ok: true, text: result.text, durationMs: Date.now() - started });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection failed" }, { status: 400 });
  }
}
