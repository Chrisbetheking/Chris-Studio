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

/**
 * Split text into prose and fenced code segments.
 *
 * Whitespace carries meaning inside a fence: collapsing it rewrites Python,
 * YAML or Makefile indentation, so only the prose segments may be compacted.
 */
function splitFencedSegments(text: string): { text: string; fenced: boolean }[] {
  const segments: { text: string; fenced: boolean }[] = [];
  const pattern = /(^|\n)([ \t]*)```[^\n]*\n[\s\S]*?\n[ \t]*```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), fenced: false });
    segments.push({ text: match[0], fenced: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), fenced: false });
  return segments;
}

/** Apply a transform to the prose around fenced code blocks only. */
function mapProse(text: string, transform: (prose: string) => string): string {
  return splitFencedSegments(text)
    .map((segment) => (segment.fenced ? segment.text : transform(segment.text)))
    .join('');
}

export function optimizeText(text: string, mode: 'off' | 'conservative' | 'balanced'): TokenOptimizationResult {
  const originalTokens = estimateTokens(text);
  if (mode === 'off' || !text.trim()) {
    return { originalText: text, optimizedText: text, originalTokens, optimizedTokens: originalTokens, savedTokens: 0, savedPercent: 0, changes: [] };
  }

  const changes: string[] = [];
  // Line-ending and trailing-space normalization is layout only and safe to
  // apply everywhere, including inside a fence.
  let optimized = text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  if (optimized !== text) changes.push('Normalized line endings and trailing spaces');

  // Blank-line collapsing is also layout only.
  optimized = optimized.replace(/\n{4,}/g, '\n\n\n');
  if (mode === 'balanced') optimized = optimized.replace(/\n{3,}/g, '\n\n');

  const deduped = dedupeConsecutiveLines(optimized.split('\n'));
  optimized = deduped.lines.join('\n');
  if (deduped.removed) changes.push(`Removed ${deduped.removed} repeated line${deduped.removed === 1 ? '' : 's'}`);

  if (mode === 'balanced') {
    // Prose-only compaction: request filler and redundant spacing never appear
    // in a fenced block, and collapsing indentation there would corrupt it.
    optimized = mapProse(optimized, (prose) => prose
      .replace(/(?:^|\n)(?:Please|请)(?:\s+)?(?:please|请)?\s*/gi, (match) => match.includes('\n') ? '\n' : '')
      .replace(/[ \t]{2,}/g, ' '));
    const trimmed = mapProse(optimized, (prose) => prose.trim());
    if (trimmed !== optimized || /[ \t]{2,}/.test(text)) {
      changes.push('Compacted redundant spacing and request filler');
    }
    optimized = trimmed;
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
