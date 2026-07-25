import { NextResponse } from "next/server";
import { providerRegistry } from "@/lib/providers/registry";
import { publicProviderConfig, saveProviderConfig } from "@/lib/vault/provider-config";

export async function GET() {
  return NextResponse.json({ providers: providerRegistry, saved: publicProviderConfig() });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.providerId) return NextResponse.json({ error: "providerId is required" }, { status: 400 });

  const saved = saveProviderConfig({
    providerId: body.providerId,
    apiKey: body.apiKey,
    model: body.model,
    baseUrl: body.baseUrl,
    enabled: body.enabled ?? true
  });

  return NextResponse.json({
    providerId: saved.providerId,
    model: saved.model,
    baseUrl: saved.baseUrl,
    enabled: saved.enabled,
    hasKey: Boolean(saved.apiKey),
    updatedAt: saved.updatedAt
  });
}
