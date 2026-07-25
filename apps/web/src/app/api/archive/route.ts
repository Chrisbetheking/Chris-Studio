import { NextResponse } from "next/server";
import { clearArchive, deleteArchive, listArchive } from "@/lib/vault/archive";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json({ records: listArchive(searchParams.get("q") || "") });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("all") === "1") return NextResponse.json({ ok: clearArchive() });
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  return NextResponse.json({ ok: deleteArchive(id) });
}
