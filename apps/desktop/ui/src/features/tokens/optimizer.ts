import type { TokenOptimizationResult } from '../../app/types';

export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  const latin = (text.match(/[\x00-\x7F]/g) ?? []).length;
  const nonLatin = text.length - latin;
  return Math.max(1, Math.ceil(latin / 4 + nonLatin / 1.7));
}

function dedupeConsecutiveLines(lines: string[]): { lines: string[]; removed: number } {
  const output: string[] = [];
  let removed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const previous = output[output.length - 1]?.trim();
    if (trimmed && previous === trimmed) {
      removed += 1;
      continue;
    }
    output.push(line);
  }
  return { lines: output, removed };
}

export function optimizeText(text: string, mode: 'off' | 'conservative' | 'balanced'): TokenOptimizationResult {
  const originalTokens = estimateTokens(text);
  if (mode === 'off' || !text.trim()) {
    return { originalText: text, optimizedText: text, originalTokens, optimizedTokens: originalTokens, savedTokens: 0, savedPercent: 0, changes: [] };
  }

  const changes: string[] = [];
  let optimized = text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  if (optimized !== text) changes.push('Normalized line endings and trailing spaces');

  optimized = optimized.replace(/\n{4,}/g, '\n\n\n');
  if (mode === 'balanced') optimized = optimized.replace(/\n{3,}/g, '\n\n');

  const deduped = dedupeConsecutiveLines(optimized.split('\n'));
  optimized = deduped.lines.join('\n');
  if (deduped.removed) changes.push(`Removed ${deduped.removed} repeated line${deduped.removed === 1 ? '' : 's'}`);

  if (mode === 'balanced') {
    optimized = optimized
      .replace(/(?:^|\n)(?:Please|请)(?:\s+)?(?:please|请)?\s*/gi, (match) => match.includes('\n') ? '\n' : '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    changes.push('Compacted redundant spacing and request filler');
  }

  const optimizedTokens = estimateTokens(optimized);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);
  return {
    originalText: text,
    optimizedText: optimized,
    originalTokens,
    optimizedTokens,
    savedTokens,
    savedPercent: originalTokens ? Math.round((savedTokens / originalTokens) * 100) : 0,
    changes: savedTokens ? changes : [],
  };
}
