import { estimateTokens } from "./tokenizer";

const defaultBudget = 4000;

export function compressPrompt(input: string, options: { question?: string; budget?: number } = {}) {
  const budget = options.budget || defaultBudget;
  if (estimateTokens(input) <= budget) return input.trim();

  const blocks = splitBlocks(input);
  const terms = collectTerms(options.question || "");

  const ranked = blocks
    .map((text, index) => ({ text, index, score: scoreBlock(text, terms, index, blocks.length) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: typeof ranked = [];
  let tokens = 0;

  for (const block of ranked) {
    const blockTokens = estimateTokens(block.text);
    if (tokens + blockTokens > budget && picked.length) continue;
    picked.push(block);
    tokens += blockTokens;
    if (tokens >= budget) break;
  }

  return picked
    .sort((a, b) => a.index - b.index)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function splitBlocks(input: string): string[] {
  const rough = input
    .split(/\n{2,}|(?=^#{1,4}\s)/m)
    .map((part) => part.trim())
    .filter(Boolean);

  if (rough.length > 1) return rough;

  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks: string[] = [];
  let bucket: string[] = [];

  for (const line of lines) {
    bucket.push(line);
    if (bucket.join("\n").length > 900) {
      blocks.push(bucket.join("\n"));
      bucket = [];
    }
  }

  if (bucket.length) blocks.push(bucket.join("\n"));
  return blocks;
}

function collectTerms(question: string) {
  return new Set(
    question
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((term) => term.length >= 2)
  );
}

function scoreBlock(block: string, terms: Set<string>, index: number, total: number) {
  const lower = block.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (lower.includes(term)) score += 6;
  }

  if (/error|exception|stack|failed|todo|fixme|bug|security|token|api|route|schema|model/i.test(block)) score += 5;
  if (/decided|decision|action item|owner|deadline|risk|requirement|endpoint|env/i.test(block)) score += 4;
  if (/^(#{1,4}|[-*]\s|\d+\.)/m.test(block)) score += 2;

  if (index === 0 || index === total - 1) score += 1.5;
  score += Math.min(3, block.length / 1500);

  return score;
}
