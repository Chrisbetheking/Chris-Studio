import { inflateRawSync, inflateSync } from "node:zlib";
import type { DocumentKind, DocumentSource } from "./pipeline";
import { inferDocumentKind } from "./pipeline";

const textExtensions = new Set([
  ".txt", ".md", ".mdx", ".markdown", ".log", ".json", ".jsonl", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cpp", ".c", ".cs", ".php", ".rb", ".swift", ".kt", ".sql", ".css", ".scss", ".html", ".vue", ".svelte", ".yaml", ".yml", ".toml", ".ini", ".env", ".conf", ".config"
]);

type ParseOptions = {
  enableOcr?: boolean;
  ocrLanguage?: string;
};

export async function parseUploadedFile(file: File, options: ParseOptions = {}): Promise<DocumentSource> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = file.name || "uploaded-file";
  const ext = extensionOf(path);
  const warnings: string[] = [];
  let content = "";
  let kind: DocumentKind = inferDocumentKind(path);

  try {
    if (ext === ".docx") {
      kind = "docx";
      const parsed = await extractDocxText(bytes);
      content = parsed.text;
      warnings.push(...parsed.warnings);
      if (!content.trim()) warnings.push("DOCX parser returned empty text. The file may contain only images, charts, or unsupported embedded objects.");
    } else if (ext === ".pdf") {
      kind = "pdf";
      const parsed = await extractPdfText(bytes);
      content = parsed.text;
      warnings.push(...parsed.warnings);
      if (!content.trim()) {
        warnings.push("PDF text extraction returned empty content. This is likely a scanned/image-only PDF. Image OCR is built in for image files; scanned-PDF page OCR needs a PDF-to-image renderer in a later update.");
      }
    } else if (isImageExtension(ext)) {
      kind = "image";
      if (options.enableOcr !== false) {
        const parsed = await extractImageTextWithOcr(bytes, options.ocrLanguage || "eng");
        content = parsed.text;
        warnings.push(...parsed.warnings);
        if (!content.trim()) warnings.push("OCR returned empty text. Try a clearer image or a different OCR language.");
      } else {
        content = buildImageRecord(path, bytes.length, "OCR disabled for this request.");
      }
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

export async function extractDocxText(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const warnings = result.messages
      ?.map((item) => item.message)
      .filter((item): item is string => Boolean(item)) || [];

    return { text: normalizeExtractedText(result.value || ""), warnings };
  } catch (error) {
    const fallback = extractDocxTextFallback(buffer);
    const message = error instanceof Error ? error.message : "mammoth DOCX parser failed";
    const warnings = [`DOCX parser fallback used: ${message}`];
    return { text: normalizeExtractedText(fallback), warnings };
  }
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod.default || mod) as unknown as (input: Buffer) => Promise<{ text?: string; numpages?: number }>;
    const result = await pdfParse(buffer);
    const text = normalizeExtractedText(result.text || "");
    if (result.numpages) warnings.push(`PDF pages detected: ${result.numpages}.`);
    return { text, warnings };
  } catch (error) {
    const fallback = extractPdfTextFallback(buffer);
    const message = error instanceof Error ? error.message : "pdf-parse failed";
    warnings.push(`PDF parser fallback used: ${message}`);
    return { text: normalizeExtractedText(fallback), warnings };
  }
}

export async function extractImageTextWithOcr(buffer: Buffer, language = "eng"): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker(language);

    try {
      const result = await worker.recognize(buffer);
      const text = normalizeExtractedText(result.data?.text || "");
      warnings.push(`OCR engine: Tesseract.js (${language}).`);
      return { text, warnings };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR failed";
    return {
      text: buildImageRecord("uploaded-image", buffer.length, `OCR failed: ${message}`),
      warnings: [`OCR failed: ${message}`]
    };
  }
}

function extractDocxTextFallback(buffer: Buffer): string {
  const xml = readZipEntry(buffer, "word/document.xml");
  if (!xml) return "";

  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:tr[^>]*>/g, "\n")
    .replace(/<\/w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
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

function extractPdfTextFallback(buffer: Buffer): string {
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
      // Keep PDF fallback best-effort. The main parser above handles normal text PDFs.
    }
  }

  return collected.join("\n");
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

function buildImageRecord(path: string, size: number, status: string) {
  return [
    `Image file: ${path}`,
    `Size: ${size} bytes`,
    `OCR status: ${status}`
  ].join("\n");
}

function normalizeExtractedText(input: string) {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function extensionOf(path: string) {
  const match = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function isImageExtension(ext: string) {
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"].includes(ext);
}

function looksTextLike(buffer: Buffer) {
  const sample = buffer.slice(0, Math.min(buffer.length, 4000));
  if (!sample.length) return true;
  const zeros = sample.filter((byte) => byte === 0).length;
  return zeros / sample.length < 0.02;
}
