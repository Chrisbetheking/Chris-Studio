import { inflateRawSync, inflateSync } from "node:zlib";
import type { DocumentKind, DocumentSource } from "./pipeline";
import { inferDocumentKind } from "./pipeline";

const textExtensions = new Set([
  ".txt", ".md", ".mdx", ".markdown", ".log", ".json", ".jsonl", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cpp", ".c", ".cs", ".php", ".rb", ".swift", ".kt", ".sql", ".css", ".scss", ".html", ".vue", ".svelte", ".yaml", ".yml", ".toml", ".ini", ".env", ".conf", ".config"
]);

export async function parseUploadedFile(file: File): Promise<DocumentSource> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = file.name || "uploaded-file";
  const ext = extensionOf(path);
  const warnings: string[] = [];
  let content = "";
  let kind: DocumentKind = inferDocumentKind(path);

  try {
    if (ext === ".docx") {
      kind = "docx";
      content = extractDocxText(bytes);
      if (!content.trim()) warnings.push("DOCX text extraction returned empty content.");
    } else if (ext === ".pdf") {
      kind = "pdf";
      content = extractPdfText(bytes);
      if (!content.trim()) warnings.push("PDF text extraction is best-effort and may miss scanned pages.");
    } else if (isImageExtension(ext)) {
      kind = "image";
      content = buildImagePlaceholder(path, bytes.length);
      warnings.push("OCR is not bundled in this prototype. Add an OCR provider later or paste recognized text manually.");
    } else if (textExtensions.has(ext) || looksTextLike(bytes)) {
      content = bytes.toString("utf8");
      kind = inferDocumentKind(path, content);
    } else {
      content = bytes.toString("utf8");
      kind = inferDocumentKind(path, content);
      warnings.push("Unknown file type. Parsed as UTF-8 text as a fallback.");
    }
  } catch (error) {
    content = "";
    warnings.push(error instanceof Error ? error.message : "Failed to parse uploaded file.");
  }

  return { path, content, kind, warnings };
}

export function extractDocxText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, "word/document.xml");
  if (!xml) return "";

  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/?w:tr[^>]*>/g, "\n")
    .replace(/<\/?w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readZipEntry(buffer: Buffer, targetName: string) {
  let offset = 0;

  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.slice(nameStart, nameStart + fileNameLength).toString("utf8");
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (name === targetName) {
      const data = buffer.slice(dataStart, dataEnd);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
      throw new Error(`Unsupported DOCX zip compression method: ${method}`);
    }

    offset = Math.max(dataEnd, offset + 30);
  }

  return "";
}

export function extractPdfText(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const collected: string[] = [];

  collectPdfTextFromString(latin, collected);

  const streamRegex = /(\d+\s+\d+\s+obj\s*<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(latin)) !== null) {
    const header = match[1];
    if (!header.includes("FlateDecode")) continue;

    try {
      const raw = header.includes("ASCII85Decode")
        ? decodeAscii85(match[2])
        : Buffer.from(match[2], "latin1");
      const inflated = inflateSync(raw).toString("latin1");
      collectPdfTextFromString(inflated, collected);
    } catch {
      // Ignore streams that cannot be decoded. PDF text extraction remains best-effort here.
    }
  }

  return collected
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectPdfTextFromString(input: string, output: string[]) {
  const tj = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tj.exec(input)) !== null) output.push(unescapePdfString(match[1]));

  const tjArray = /\[((?:.|\n|\r)*?)\]\s*TJ/g;
  while ((match = tjArray.exec(input)) !== null) {
    const pieces = [...match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((item) => unescapePdfString(item[1]));
    if (pieces.length) output.push(pieces.join(""));
  }
}

function decodeAscii85(input: string) {
  const cleaned = input
    .replace(/<~/g, "")
    .replace(/~>/g, "")
    .replace(/\s+/g, "");
  const bytes: number[] = [];
  let group: number[] = [];

  for (const char of cleaned) {
    if (char === "z" && group.length === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 33 || code > 117) continue;
    group.push(code - 33);

    if (group.length === 5) {
      pushAscii85Group(group, 4, bytes);
      group = [];
    }
  }

  if (group.length) {
    const useful = group.length - 1;
    while (group.length < 5) group.push(84);
    pushAscii85Group(group, useful, bytes);
  }

  return Buffer.from(bytes);
}

function pushAscii85Group(group: number[], usefulBytes: number, output: number[]) {
  let value = 0;
  for (const digit of group) value = value * 85 + digit;

  const decoded = [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ];

  output.push(...decoded.slice(0, usefulBytes));
}

function unescapePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function buildImagePlaceholder(path: string, size: number) {
  return [
    `Image file: ${path}`,
    `Size: ${size} bytes`,
    "OCR status: not extracted by the local prototype.",
    "Next step: connect a local OCR engine, a vision model, or paste OCR text into the Document Pipeline panel.",
    "This placeholder still lets TokenFence create metadata, routing decisions, and a safe processing record."
  ].join("\n");
}

function extensionOf(path: string) {
  const match = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function isImageExtension(ext: string) {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"].includes(ext);
}

function looksTextLike(buffer: Buffer) {
  const sample = buffer.slice(0, Math.min(buffer.length, 4000));
  if (!sample.length) return true;
  const zeros = sample.filter((byte) => byte === 0).length;
  return zeros / sample.length < 0.02;
}
