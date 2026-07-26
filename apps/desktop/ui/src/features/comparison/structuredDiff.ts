export interface ComparisonResponse {
  id: string;
  label: string;
  content: string;
}

export interface ClaimAlignment {
  leftId: string;
  rightId: string;
  left: string;
  right: string;
  similarity: number;
}

export interface PotentialDisagreement extends ClaimAlignment {
  reason: 'different-number' | 'opposite-polarity' | 'different-conclusion';
}

export interface StructuredComparison {
  sharedPoints: ClaimAlignment[];
  potentialDisagreements: PotentialDisagreement[];
  uniquePoints: Record<string, string[]>;
  style: Record<string, {
    characters: number;
    sentences: number;
    averageSentenceLength: number;
    headings: number;
    listItems: number;
    hedgingTerms: number;
  }>;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'this', 'that',
  '的', '了', '和', '与', '或', '是', '在', '对', '将', '可以', '一个', '一种', '以及', '并且', '需要',
]);
const NEGATION = /\b(?:not|never|no|cannot|can't|won't|false|incorrect|unlikely)\b|(?:不|没有|无法|错误|并非|不会|不能)/i;
const CONCLUSION = /\b(?:therefore|thus|so|conclude|recommend|should|must)\b|(?:因此|所以|结论|建议|应该|必须)/i;
const HEDGING = /\b(?:may|might|could|possibly|likely|perhaps|appears|suggests)\b|(?:可能|或许|大概|似乎|预计|倾向于)/gi;

function sentences(value: string): string[] {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/\n/g, ' '))
    .split(/(?<=[。！？!?])\s+|(?<=[.!?])\s+(?=[A-Z0-9])|\n{2,}|\n(?=[-*•]\s|\d+[.)、]\s*)/)
    .map((entry) => entry.replace(/^[-*•\d.)、\s]+/, '').trim())
    .filter((entry) => entry.length >= 8)
    .slice(0, 80);
}

function tokens(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ');
  const parts = normalized.split(/\s+/).filter((entry) => entry.length > 1 && !STOP_WORDS.has(entry));
  const chinese = normalized.match(/[\p{Script=Han}]{2,}/gu) || [];
  for (const group of chinese) {
    for (let index = 0; index < group.length - 1; index += 1) parts.push(group.slice(index, index + 2));
  }
  return new Set(parts.slice(0, 220));
}

function similarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(1, a.size + b.size - overlap);
}

function numbers(value: string): string[] {
  return (value.match(/(?:¥|￥|\$|€|£)?\d+(?:[.,]\d+)*(?:%|万|亿|ms|s|分钟|小时|天|年)?/g) || [])
    .map((entry) => entry.replace(/,/g, ''));
}

function disagreementReason(left: string, right: string, score: number): PotentialDisagreement['reason'] | undefined {
  const leftNumbers = numbers(left);
  const rightNumbers = numbers(right);
  if (score >= 0.18 && leftNumbers.length && rightNumbers.length && leftNumbers.join('|') !== rightNumbers.join('|')) return 'different-number';
  if (score >= 0.2 && NEGATION.test(left) !== NEGATION.test(right)) return 'opposite-polarity';
  if (score >= 0.24 && CONCLUSION.test(left) && CONCLUSION.test(right) && score < 0.55) return 'different-conclusion';
  return undefined;
}

function style(value: string) {
  const rows = sentences(value);
  const characters = value.trim().length;
  return {
    characters,
    sentences: rows.length,
    averageSentenceLength: rows.length ? Math.round(characters / rows.length) : characters,
    headings: (value.match(/^#{1,6}\s+.+$/gm) || []).length,
    listItems: (value.match(/^\s*(?:[-*•]|\d+[.)、])\s+.+$/gm) || []).length,
    hedgingTerms: (value.match(HEDGING) || []).length,
  };
}

function alignmentKey(item: ClaimAlignment): string {
  return [item.leftId, item.rightId, item.left, item.right].join('\u0000');
}

export function compareResponses(responses: ComparisonResponse[]): StructuredComparison {
  const clean = responses
    .map((entry) => ({ ...entry, id: String(entry.id), label: String(entry.label), content: String(entry.content || '').trim() }))
    .filter((entry) => entry.content)
    .slice(0, 4);
  const claims = new Map(clean.map((response) => [response.id, sentences(response.content)]));
  const retained = new Map(clean.map((response) => [response.id, new Set(claims.get(response.id) || [])]));
  const styleMap: StructuredComparison['style'] = Object.fromEntries(clean.map((response) => [response.id, style(response.content)]));
  const sharedPoints: ClaimAlignment[] = [];
  const potentialDisagreements: PotentialDisagreement[] = [];
  const seen = new Set<string>();

  for (let leftIndex = 0; leftIndex < clean.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < clean.length; rightIndex += 1) {
      const leftResponse = clean[leftIndex];
      const rightResponse = clean[rightIndex];
      const rightClaims = claims.get(rightResponse.id) || [];
      const usedRight = new Set<string>();
      for (const left of claims.get(leftResponse.id) || []) {
        let best: { claim: string; score: number } | undefined;
        for (const right of rightClaims) {
          if (usedRight.has(right)) continue;
          const score = similarity(left, right);
          if (!best || score > best.score) best = { claim: right, score };
        }
        if (!best || best.score < 0.18) continue;
        const base: ClaimAlignment = {
          leftId: leftResponse.id,
          rightId: rightResponse.id,
          left,
          right: best.claim,
          similarity: Number(best.score.toFixed(2)),
        };
        const reason = disagreementReason(left, best.claim, best.score);
        if (reason) {
          const item: PotentialDisagreement = { ...base, reason };
          const key = alignmentKey(item);
          if (!seen.has(key)) potentialDisagreements.push(item);
          seen.add(key);
        } else if (best.score >= 0.42) {
          const key = alignmentKey(base);
          if (!seen.has(key)) sharedPoints.push(base);
          seen.add(key);
        } else {
          continue;
        }
        retained.get(leftResponse.id)?.delete(left);
        retained.get(rightResponse.id)?.delete(best.claim);
        usedRight.add(best.claim);
      }
    }
  }

  const uniquePoints: Record<string, string[]> = {};
  for (const response of clean) uniquePoints[response.id] = [...(retained.get(response.id) || [])].slice(0, 12);
  return {
    sharedPoints: sharedPoints.sort((a, b) => b.similarity - a.similarity).slice(0, 18),
    potentialDisagreements: potentialDisagreements.sort((a, b) => b.similarity - a.similarity).slice(0, 18),
    uniquePoints,
    style: styleMap,
  };
}

export function formatStructuredComparison(responses: ComparisonResponse[], comparison = compareResponses(responses)): string {
  const labelById = new Map(responses.map((entry) => [entry.id, entry.label]));
  const pair = (item: ClaimAlignment) => `${labelById.get(item.leftId) || item.leftId} ↔ ${labelById.get(item.rightId) || item.rightId}`;
  const lines: string[] = ['STRUCTURED MODEL COMPARISON'];
  lines.push('', 'Shared points:');
  if (!comparison.sharedPoints.length) lines.push('- No strong shared claims detected.');
  for (const item of comparison.sharedPoints) lines.push(`- [${pair(item)}] ${item.left}  ↔  ${item.right}  [${Math.round(item.similarity * 100)}%]`);
  lines.push('', 'Potential disagreements:');
  if (!comparison.potentialDisagreements.length) lines.push('- No obvious factual or polarity conflict detected.');
  for (const item of comparison.potentialDisagreements) lines.push(`- [${item.reason}; ${pair(item)}] ${item.left}  ↔  ${item.right}`);
  lines.push('', 'Unique points:');
  for (const [id, responseClaims] of Object.entries(comparison.uniquePoints)) {
    lines.push(`- ${labelById.get(id) || id}:`);
    if (!responseClaims.length) lines.push('  - No unique claim detected.');
    for (const claim of responseClaims) lines.push(`  - ${claim}`);
  }
  lines.push('', 'Style metrics:');
  for (const [id, metrics] of Object.entries(comparison.style)) {
    lines.push(`- ${labelById.get(id) || id}: ${metrics.characters} chars, ${metrics.sentences} sentences, avg ${metrics.averageSentenceLength}, ${metrics.headings} headings, ${metrics.listItems} list items, ${metrics.hedgingTerms} hedges`);
  }
  return lines.join('\n');
}
