import { NextResponse } from "next/server";
import type { DocumentSource } from "@/lib/document/pipeline";
import { inferDocumentKind, runDocumentPipeline } from "@/lib/document/pipeline";
import { parseUploadedFile } from "@/lib/document/server-parsers";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReadOptions = {
  enableOcr: boolean;
  ocrLanguage: string;
};

export async function POST(request: Request) {
  try {
    const sources = await readSources(request);

    if (!sources.length) {
      return NextResponse.json({ error: "At least one document is required." }, { status: 400 });
    }

    const result = runDocumentPipeline(sources);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document pipeline failed." }, { status: 500 });
  }
}

async function readSources(request: Request): Promise<DocumentSource[]> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const options = readOptionsFromForm(form);
    const parsed = await Promise.all(files.map((file) => parseUploadedFile(file, options)));

    const textItems = form.getAll("documents");
    const manual = textItems.flatMap((item) => parseManualDocumentItem(item));
    return [...parsed, ...manual].filter((source: { content: string }) => source.content.trim());
  }

  const body = await request.json();
  const files = Array.isArray(body.files) ? body.files : [];

  return files
    .map((item: Record<string, unknown>, index: number) => {
      const record = item as { path?: unknown; content?: unknown; kind?: unknown };
      const path = String(record.path || `document-${index + 1}.txt`).trim();
      const content = String(record.content || "");
      const result: { path: string; content: string; kind: ReturnType<typeof inferDocumentKind> } = {
        path,
        content,
        kind: typeof record.kind === "string" ? inferDocumentKind(path, content) : inferDocumentKind(path, content)
      };
      return result;
    })
    .filter((source: { content: string }) => source.content.trim());
}

function readOptionsFromForm(form: FormData): ReadOptions {
  const enableOcrRaw = String(form.get("enableOcr") ?? "true");
  const language = String(form.get("ocrLanguage") || "eng").trim();

  return {
    enableOcr: enableOcrRaw !== "false",
    ocrLanguage: language || "eng"
  };
}

function parseManualDocumentItem(value: FormDataEntryValue): DocumentSource[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: Record<string, unknown>, index: number) => {
        const record = item as { path?: unknown; content?: unknown };
        const path = String(record.path || `document-${index + 1}.txt`);
        const content = String(record.content || "");
        return { path, content, kind: inferDocumentKind(path, content) };
      })
      .filter((source: { content: string }) => source.content.trim());
  } catch {
    return [];
  }
}
