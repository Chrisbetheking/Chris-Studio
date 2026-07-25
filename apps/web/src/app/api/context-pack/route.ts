import { NextResponse } from "next/server";
import { generateContextPack } from "@/lib/agent-pack/generate";

export async function POST(request: Request) {
  const body = await request.json();
  const files = Array.isArray(body.files) ? body.files : [];

  if (!files.length) {
    return NextResponse.json({ error: "files are required" }, { status: 400 });
  }

  const pack = generateContextPack(files, {
    budget: Number(body.budget || 8000),
    task: body.task
  });

  return NextResponse.json({ pack });
}
