import { NextResponse } from "next/server";
import { guardPrompt } from "@/lib/core/guard";

export async function POST(request: Request) {
  const body = await request.json();
  const text = String(body.text || "");

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  return NextResponse.json(guardPrompt(text, {
    question: body.question,
    budget: Number(body.budget || 4000),
    mode: body.mode || "safe",
    policy: body.policy || "balanced"
  }));
}
