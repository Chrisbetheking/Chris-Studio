import type { AttachmentDraft, KnowledgeChunk, KnowledgeSearchHit } from '../../app/types';

const MAX_CHUNK_CHARS = 1_800;
const OVERLAP_CHARS = 220;
const DEFAULT_LIMIT = 6;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Validate one indexed chunk.
 *
 * The index is built from unrelated call sites and can also be handed back from
 * storage, so every field is checked before use. A `null` entry used to crash
 * the document-frequency pass on `chunk.tokens`, and a non-string `text` crashed
 * the phrase boost on `chunk.text.toLowerCase`.
 */
function normalizeChunk(entry: unknown): KnowledgeChunk | undefined {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
  const row = entry as Record<string, unknown>;
  const id = asText(row.id);
  if (!id) return undefined;
  const tokens = Array.isArray(row.tokens)
    ? row.tokens.filter((token): token is string => typeof token === 'string' && token.length > 0)
    : [];
  const index = Number(row.index);
  return {
    id,
    sourceId: asText(row.sourceId),
    sourceName: asText(row.sourceName),
    text: asText(row.text),
    tokens,
    index: Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0,
  };
}

function normalizedTokens(text: string): string[] {
  const value = asText(text);
  if (!value) return [];
  const latin = value.toLowerCase().match(/[a-z0-9_\-.]{2,}/g) ?? [];
  const han = Array.from(value.matchAll(/[\u3400-\u9fff]{2,}/g)).flatMap((match) => {
    const token = match[0];
    const tokens: string[] = [];
    for (let index = 0; index < token.length - 1; index += 1) tokens.push(token.slice(index, index + 2));
    return tokens;
  });
  return Array.from(new Set([...latin, ...han])).slice(0, 1_200);
}

function splitText(text: string): string[] {
  const normalized = asText(text).replace(/\r\n/g, '\n').trim();
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

/**
 * Build a searchable index from the attached files.
 *
 * Each attachment is treated as untrusted input: a `null` entry, a missing
 * `content` field or a non-string `content` used to throw inside `splitText`
 * (`text.replace is not a function`) and abort the whole indexing pass.
 */
export function buildKnowledgeIndex(files: AttachmentDraft[]): KnowledgeChunk[] {
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    if (!file || typeof file !== 'object') return [];
    const sourceId = asText((file as { id?: unknown }).id);
    const sourceName = asText((file as { name?: unknown }).name);
    const content = asText((file as { content?: unknown }).content);
    if (!content) return [];
    return splitText(content).map((text, index) => ({
      id: `${sourceId}:${index}`,
      sourceId,
      sourceName,
      text,
      tokens: normalizedTokens(text),
      index,
    }));
  });
}

/**
 * Rank the indexed chunks against a query.
 *
 * The query is normalized first: a `null`, a number or an object used to reach
 * `toLowerCase` directly and throw, so a malformed query silently broke the
 * whole retrieval step instead of returning no hits.
 */
export function searchKnowledge(index: KnowledgeChunk[], query: string, limit = DEFAULT_LIMIT): KnowledgeSearchHit[] {
  const queryText = asText(query).trim();
  if (!queryText) return [];
  const entries = (Array.isArray(index) ? index : [])
    .map(normalizeChunk)
    .filter((chunk): chunk is KnowledgeChunk => Boolean(chunk));
  const queryTokens = normalizedTokens(queryText);
  if (!queryTokens.length || !entries.length) return [];

  const documentFrequency = new Map<string, number>();
  for (const chunk of entries) {
    for (const token of new Set(chunk.tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const needle = queryText.toLowerCase();
  const hits = entries.map((chunk) => {
    const set = new Set(chunk.tokens);
    let score = 0;
    for (const token of queryTokens) {
      if (!set.has(token)) continue;
      const df = documentFrequency.get(token) ?? 1;
      score += Math.log(1 + entries.length / df);
    }
    const phraseBoost = chunk.text.toLowerCase().includes(needle) ? 3 : 0;
    return { chunk, score: score + phraseBoost };
  }).filter((hit) => hit.score > 0);

  // The limit must stay predictable: only a finite positive number narrows the
  // result set. Anything else (NaN, Infinity, a negative value, 0, a missing
  // argument) falls back to the documented default instead of silently
  // returning every hit — `slice(0, NaN)` used to return an empty list and
  // `slice(0, Infinity)` used to return the whole index.
  const requested = typeof limit === 'number' ? limit : Number(limit);
  const bounded = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT;
  return hits.sort((a, b) => b.score - a.score).slice(0, bounded);
}

export function formatKnowledgeContext(hits: KnowledgeSearchHit[]): string {
  const rows = (Array.isArray(hits) ? hits : []).filter((hit) => hit && typeof hit === 'object');
  if (!rows.length) return '';
  return rows.map((hit, index) => {
    const chunk = normalizeChunk((hit as { chunk?: unknown }).chunk);
    const sourceName = chunk?.sourceName || 'attachment';
    const chunkIndex = (chunk?.index ?? 0) + 1;
    const text = chunk?.text ?? '';
    return `[#${index + 1} ${sourceName} · chunk ${chunkIndex}]\n${text}`;
  }).join('\n\n');
}
