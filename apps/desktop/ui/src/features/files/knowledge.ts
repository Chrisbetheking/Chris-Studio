import type { AttachmentDraft, KnowledgeChunk, KnowledgeSearchHit } from '../../app/types';

const MAX_CHUNK_CHARS = 1_800;
const OVERLAP_CHARS = 220;

function normalizedTokens(text: string): string[] {
  const latin = text.toLowerCase().match(/[a-z0-9_\-.]{2,}/g) ?? [];
  const han = Array.from(text.matchAll(/[\u3400-\u9fff]{2,}/g)).flatMap((match) => {
    const value = match[0];
    const tokens: string[] = [];
    for (let index = 0; index < value.length - 1; index += 1) tokens.push(value.slice(index, index + 2));
    return tokens;
  });
  return Array.from(new Set([...latin, ...han])).slice(0, 1_200);
}

function splitText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + MAX_CHUNK_CHARS);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf('\n\n', end);
      const sentence = normalized.lastIndexOf('。', end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > cursor + 700) end = boundary + 1;
    }
    const chunk = normalized.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    cursor = Math.max(cursor + 1, end - OVERLAP_CHARS);
  }
  return chunks;
}

export function buildKnowledgeIndex(files: AttachmentDraft[]): KnowledgeChunk[] {
  return files.flatMap((file) => splitText(file.content).map((text, index) => ({
    id: `${file.id}:${index}`,
    sourceId: file.id,
    sourceName: file.name,
    text,
    tokens: normalizedTokens(text),
    index,
  })));
}

export function searchKnowledge(index: KnowledgeChunk[], query: string, limit = 6): KnowledgeSearchHit[] {
  const queryTokens = normalizedTokens(query);
  if (!queryTokens.length || !index.length) return [];
  const documentFrequency = new Map<string, number>();
  for (const chunk of index) {
    for (const token of new Set(chunk.tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const hits = index.map((chunk) => {
    const set = new Set(chunk.tokens);
    let score = 0;
    for (const token of queryTokens) {
      if (!set.has(token)) continue;
      const df = documentFrequency.get(token) ?? 1;
      score += Math.log(1 + index.length / df);
    }
    const phraseBoost = chunk.text.toLowerCase().includes(query.trim().toLowerCase()) ? 3 : 0;
    return { chunk, score: score + phraseBoost };
  }).filter((hit) => hit.score > 0);
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function formatKnowledgeContext(hits: KnowledgeSearchHit[]): string {
  if (!hits.length) return '';
  return hits.map((hit, index) => `[#${index + 1} ${hit.chunk.sourceName} · chunk ${hit.chunk.index + 1}]\n${hit.chunk.text}`).join('\n\n');
}
