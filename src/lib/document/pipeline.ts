import type { Detection, RiskScore } from "../types";
import { scoreRisk } from "../core/risk";
import { scanText } from "../core/scanner";
import { estimateTokens } from "../core/tokenizer";

export type DocumentKind = "pdf" | "docx" | "image" | "markdown" | "text" | "code" | "log" | "json" | "unknown";

export type DocumentSource = {
  path: string;
  content: string;
  kind?: DocumentKind;
  warnings?: string[];
};

export type DocumentRoute = {
  providerId: string;
  model: string;
  reason: string;
  localPreferred: boolean;
};

export type DocumentChunk = {
  chunkId: string;
  fileName: string;
  fileKind: DocumentKind;
  page?: number;
  section?: string;
  chunkIndex: number;
  text: string;
  tokens: number;
  risk: RiskScore;
  detections: Array<Pick<Detection, "kind" | "label" | "severity">>;
  suggestedRoute: DocumentRoute;
};

export type DocumentPipelineFile = {
  fileName: string;
  fileKind: DocumentKind;
  originalChars: number;
  cleanedChars: number;
  originalTokens: number;
  cleanedTokens: number;
  removedApproxPercent: number;
  risk: RiskScore;
  chunks: DocumentChunk[];
  suggestedRoute: DocumentRoute;
  warnings: string[];
};

export type DocumentPipelineResult = {
  createdAt: string;
  files: DocumentPipelineFile[];
  chunks: DocumentChunk[];
  beforeCleaning: string;
  afterCleaning: string;
  markdown: string;
  chunksJson: string;
  summary: {
    fileCount: number;
    chunkCount: number;
    highRiskFiles: number;
    totalOriginalTokens: number;
    totalCleanedTokens: number;
    savedPercent: number;
  };
};

const chunkBudget = 520;
const maxChunkChars = 2300;

export function runDocumentPipeline(sources: DocumentSource[]): DocumentPipelineResult {
  const files = sources
    .filter((source) => source.content.trim())
    .map((source) => processDocument(source));

  const chunks = files.flatMap((file) => file.chunks);
  const totalOriginalTokens = files.reduce((sum, file) => sum + file.originalTokens, 0);
  const totalCleanedTokens = files.reduce((sum, file) => sum + file.cleanedTokens, 0);

  return {
    createdAt: new Date().toISOString(),
    files,
    chunks,
    beforeCleaning: sources.map((source) => `# ${source.path}\n\n${source.content.trim()}`).join("\n\n---\n\n").trim(),
    afterCleaning: files.map((file) => `# ${file.fileName}\n\n${file.chunks.map((chunk) => chunk.text).join("\n\n")}`).join("\n\n---\n\n").trim(),
    markdown: buildMarkdown(files),
    chunksJson: JSON.stringify(chunks, null, 2),
    summary: {
      fileCount: files.length,
      chunkCount: chunks.length,
      highRiskFiles: files.filter((file) => file.risk.label === "high" || file.risk.label === "critical").length,
      totalOriginalTokens,
      totalCleanedTokens,
      savedPercent: percentSaved(totalOriginalTokens, totalCleanedTokens)
    }
  };
}

function processDocument(source: DocumentSource): DocumentPipelineFile {
  const fileKind = source.kind || inferDocumentKind(source.path, source.content);
  const cleaned = cleanDocumentText(source.content);
  const detections = scanText(cleaned);
  const risk = scoreRisk(detections);
  const suggestedRoute = suggestDocumentRoute({ fileName: source.path, kind: fileKind, risk, text: cleaned });
  const chunks = chunkDocument({ fileName: source.path, fileKind, cleanedText: cleaned, route: suggestedRoute });

  const originalTokens = estimateTokens(source.content);
  const cleanedTokens = estimateTokens(cleaned);

  return {
    fileName: source.path,
    fileKind,
    originalChars: source.content.length,
    cleanedChars: cleaned.length,
    originalTokens,
    cleanedTokens,
    removedApproxPercent: percentSaved(originalTokens, cleanedTokens),
    risk,
    chunks,
    suggestedRoute,
    warnings: source.warnings || []
  };
}

export function inferDocumentKind(path: string, content = ""): DocumentKind {
  const lower = path.toLowerCase();

  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "docx";
  if (/\.(png|jpg|jpeg|webp|gif|bmp|tiff)$/i.test(lower)) return "image";
  if (/\.(md|mdx|markdown)$/i.test(lower)) return "markdown";
  if (/\.(log|trace)$/i.test(lower)) return "log";
  if (/\.(json|jsonl)$/i.test(lower)) return "json";
  if (/\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|cs|php|rb|swift|kt|sql|css|scss|html|vue|svelte)$/i.test(lower)) return "code";
  if (/\.(txt|csv|yaml|yml|toml|ini|env|conf|config)$/i.test(lower)) return "text";

  if (/function |class |import |export |const |let |var |def |public class/.test(content)) return "code";
  if (/^#{1,4}\s|```|\*\s+/m.test(content)) return "markdown";
  return "unknown";
}

export function cleanDocumentText(input: string) {
  const normalized = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/([A-Za-z])-[ \t]*\n([a-z])/g, "$1$2");

  const pages = normalized.split(/\n\s*(?:-{3,}|={3,}|Page\s+\d+\s*$|第\s*\d+\s*页\s*$)\s*\n|\f/gi);
  const repeated = findRepeatedPageLines(pages);
  const seenParagraphs = new Set<string>();

  const cleanedPages = pages.map((page) => {
    const lines = page
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !isPageNoise(line) && !repeated.has(normalizeLine(line)));

    return lines.join("\n");
  });

  const paragraphs = cleanedPages
    .join("\n\n")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .filter((paragraph) => {
      const key = normalizeLine(paragraph).slice(0, 240);
      if (key.length > 30 && seenParagraphs.has(key)) return false;
      if (key.length > 30) seenParagraphs.add(key);
      return true;
    });

  return paragraphs.join("\n\n").trim();
}

function chunkDocument({
  fileName,
  fileKind,
  cleanedText,
  route
}: {
  fileName: string;
  fileKind: DocumentKind;
  cleanedText: string;
  route: DocumentRoute;
}): DocumentChunk[] {
  const parts = splitBySection(cleanedText);
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 1;

  for (const part of parts) {
    const paragraphs = part.text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    let bucket: string[] = [];

    function flush() {
      const text = bucket.join("\n\n").trim();
      if (!text) return;
      chunks.push(makeChunk({ fileName, fileKind, text, section: part.section, index: chunkIndex++, route }));
      bucket = [];
    }

    for (const paragraph of paragraphs) {
      const next = [...bucket, paragraph].join("\n\n");
      if (estimateTokens(next) > chunkBudget || next.length > maxChunkChars) flush();
      bucket.push(paragraph);
    }

    flush();
  }

  if (!chunks.length && cleanedText.trim()) {
    chunks.push(makeChunk({ fileName, fileKind, text: cleanedText.trim(), section: "Document", index: 1, route }));
  }

  return chunks;
}

function makeChunk({
  fileName,
  fileKind,
  text,
  section,
  index,
  route
}: {
  fileName: string;
  fileKind: DocumentKind;
  text: string;
  section?: string;
  index: number;
  route: DocumentRoute;
}): DocumentChunk {
  const detections = scanText(text);
  const risk = scoreRisk(detections);
  return {
    chunkId: `${slug(fileName)}-${String(index).padStart(3, "0")}`,
    fileName,
    fileKind,
    section,
    chunkIndex: index,
    text,
    tokens: estimateTokens(text),
    risk,
    detections: detections.map((item) => ({ kind: item.kind, label: item.label, severity: item.severity })),
    suggestedRoute: risk.label === "high" || risk.label === "critical" ? suggestDocumentRoute({ fileName, kind: fileKind, risk, text }) : route
  };
}

function splitBySection(text: string): Array<{ section: string; text: string }> {
  const lines = text.split("\n");
  const sections: Array<{ section: string; text: string }> = [];
  let current = "Document";
  let bucket: string[] = [];

  function flush() {
    const text = bucket.join("\n").trim();
    if (text) sections.push({ section: current, text });
    bucket = [];
  }

  for (const line of lines) {
    if (/^(#{1,4}\s+|\d+(?:\.\d+)*\s+|[一二三四五六七八九十]+[、.．])/.test(line) && line.length <= 90) {
      flush();
      current = line.replace(/^#{1,4}\s+/, "").trim();
      bucket.push(line);
    } else {
      bucket.push(line);
    }
  }

  flush();
  return sections.length ? sections : [{ section: "Document", text }];
}

function suggestDocumentRoute({
  fileName,
  kind,
  risk,
  text
}: {
  fileName: string;
  kind: DocumentKind;
  risk: RiskScore;
  text: string;
}): DocumentRoute {
  const lower = fileName.toLowerCase();
  const highRisk = risk.label === "high" || risk.label === "critical" || /(^|\/)\.env(\.|$)?|secret|credential|private|token|key/i.test(lower);

  if (highRisk) {
    return {
      providerId: "ollama",
      model: "llama3.1",
      localPreferred: true,
      reason: "This file contains high-risk or secret-like content. Prefer a local model or a redacted cloud request."
    };
  }

  if (kind === "code" || /src\/|app\/|lib\/|route\.|controller|service/.test(lower)) {
    return {
      providerId: "deepseek",
      model: "deepseek-chat",
      localPreferred: false,
      reason: "Code-like files are routed to a coding-friendly model by default."
    };
  }

  if (kind === "image") {
    return {
      providerId: "gemini",
      model: "gemini-1.5-flash",
      localPreferred: false,
      reason: "Image documents need a vision or OCR-capable model/provider."
    };
  }

  if (kind === "pdf" || kind === "docx" || estimateTokens(text) > 2400) {
    return {
      providerId: "gemini",
      model: "gemini-1.5-flash",
      localPreferred: false,
      reason: "Long documents benefit from a long-context model after cleaning and chunking."
    };
  }

  if (containsChinese(text)) {
    return {
      providerId: "kimi",
      model: "moonshot-v1-8k",
      localPreferred: false,
      reason: "Chinese-heavy documents are routed to a China-friendly text model by default."
    };
  }

  return {
    providerId: "openai",
    model: "gpt-4.1-mini",
    localPreferred: false,
    reason: "Clean general documents are routed to a cost-efficient general model."
  };
}

function buildMarkdown(files: DocumentPipelineFile[]) {
  const lines: string[] = ["# Document Intelligence Output", ""];

  for (const file of files) {
    lines.push(`## ${file.fileName}`, "");
    lines.push(`- Type: ${file.fileKind}`);
    lines.push(`- Risk: ${file.risk.label} (${file.risk.score})`);
    lines.push(`- Tokens: ${file.originalTokens} -> ${file.cleanedTokens} (${file.removedApproxPercent}% saved)`);
    lines.push(`- Suggested route: ${file.suggestedRoute.providerId} / ${file.suggestedRoute.model}`);
    if (file.warnings.length) lines.push(`- Warnings: ${file.warnings.join("; ")}`);
    lines.push("");

    for (const chunk of file.chunks) {
      lines.push(`### ${chunk.chunkId}`);
      lines.push(`Metadata: section=${chunk.section || "Document"}; tokens=${chunk.tokens}; risk=${chunk.risk.label}; route=${chunk.suggestedRoute.providerId}/${chunk.suggestedRoute.model}`);
      lines.push("");
      lines.push(chunk.text);
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

function findRepeatedPageLines(pages: string[]) {
  const counts = new Map<string, number>();
  if (pages.length < 3) return new Set<string>();

  for (const page of pages) {
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    const candidates = [...lines.slice(0, 3), ...lines.slice(-3)];
    for (const line of candidates) {
      const key = normalizeLine(line);
      if (key.length >= 6 && key.length <= 120) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.ceil(pages.length * 0.55));
  return new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([key]) => key));
}

function isPageNoise(line: string) {
  return /^\d+$/.test(line)
    || /^page\s+\d+(\s+of\s+\d+)?$/i.test(line)
    || /^第\s*\d+\s*页$/.test(line)
    || /^confidential\s*[-–—]?\s*internal use only$/i.test(line);
}

function normalizeLine(line: string) {
  return line.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsChinese(text: string) {
  const matches = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  return matches > 20 || matches / Math.max(text.length, 1) > 0.12;
}

function percentSaved(before: number, after: number) {
  if (!before) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 100));
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "document";
}
