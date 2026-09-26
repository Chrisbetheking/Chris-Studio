import type { ContextFile } from "../types";
import { compressPrompt } from "../core/compressor";
import { scanText } from "../core/scanner";
import { estimateTokens } from "../core/tokenizer";

const importantNames = ["package.json", "README", "next.config", "vite.config", "tsconfig", "schema", "route", "controller", "service", "app", "page"];

export function generateContextPack(files: ContextFile[], options: { budget?: number; task?: string } = {}) {
  const budget = options.budget || 8000;
  const cleanFiles = files
    .filter((file) => file.content.trim())
    .filter((file) => !shouldSkip(file.path))
    .map((file) => ({ ...file, score: fileScore(file.path, file.content) }))
    .sort((a, b) => b.score - a.score);

  const sections: string[] = [];
  sections.push("# Agent Context Pack", "");
  if (options.task) sections.push("## Task", options.task, "");

  sections.push("## Project map", "");
  sections.push(cleanFiles.slice(0, 80).map((file) => `- ${file.path} (${estimateTokens(file.content)} est. tokens)`).join("\n"));
  sections.push("");

  const risky = cleanFiles.flatMap((file) => scanText(file.content).map((hit) => ({ file: file.path, hit })));
  if (risky.length) {
    sections.push("## Risk notes", "");
    for (const item of risky.slice(0, 30)) {
      sections.push(`- ${item.file}: ${item.hit.label}`);
    }
    sections.push("");
  }

  sections.push("## Key files", "");

  let used = estimateTokens(sections.join("\n"));
  for (const file of cleanFiles) {
    const room = budget - used - 200;
    if (room <= 0) break;

    const body = compressPrompt(file.content, { budget: Math.min(room, 1600), question: options.task });
    const block = [`### ${file.path}`, "", "```", body, "```", ""].join("\n");
    const cost = estimateTokens(block);
    if (used + cost > budget && sections.length > 8) continue;

    sections.push(block);
    used += cost;
  }

  sections.push("## Suggested prompt", "");
  sections.push("Use this context pack as the source of truth. Avoid reading secret files unless the user explicitly asks and confirms it is safe.");

  return sections.join("\n").trim() + "\n";
}

function shouldSkip(path: string) {
  return /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.tokenfence)(\/|$)/.test(path)
    || /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|lock)$/i.test(path)
    || /(^|\/)\.env(\.|$)?/.test(path);
}

function fileScore(path: string, content: string) {
  const lower = path.toLowerCase();
  let score = 0;

  if (importantNames.some((name) => lower.includes(name))) score += 8;
  if (/src\/|app\/|pages\/|lib\//.test(lower)) score += 4;
  if (/test|spec|mock|fixture/.test(lower)) score -= 2;
  if (/export |function |class |interface |type /.test(content)) score += 4;
  if (content.length < 2000) score += 1;
  if (content.length > 20000) score -= 3;

  return score;
}
