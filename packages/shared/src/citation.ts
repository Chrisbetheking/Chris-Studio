export interface CitationSource {
  id: string;
  title: string;
  url?: string;
  snippet: string;
  relevance: number;
  retrievedAt: number;
}

export interface CitationPanel {
  query: string;
  sources: CitationSource[];
  generatedAt: number;
  groundedResponse?: string;
}

/** Default number of sources rendered into a citation block. */
export const DEFAULT_MAX_CITED_SOURCES = 5;

/**
 * Build a citation panel from retrieved sources.
 *
 * The panel is sorted by relevance, but the sort must never touch the caller's
 * array: `Array.prototype.sort` mutates in place, so passing a shared or frozen
 * source list used to reorder it as a side effect of rendering.
 */
export function createCitationPanel(query: string, sources: CitationSource[]): CitationPanel {
  return {
    query,
    sources: [...sources].sort((a, b) => b.relevance - a.relevance),
    generatedAt: Date.now(),
  };
}

/**
 * Keep the most relevant sources.
 *
 * A non-finite `minRelevance` or `maxSources` would otherwise filter everything
 * out or slice to an empty list, so both bounds are normalized first.
 */
export function filterRelevantSources(
  sources: CitationSource[],
  minRelevance: number = 0.5,
  maxSources: number = DEFAULT_MAX_CITED_SOURCES
): CitationSource[] {
  const threshold = Number.isFinite(minRelevance) ? minRelevance : 0.5;
  const limit = Number.isFinite(maxSources) ? Math.max(0, Math.floor(maxSources)) : DEFAULT_MAX_CITED_SOURCES;
  if (limit === 0) return [];
  return sources
    .filter((source) => Number.isFinite(source?.relevance) && source.relevance >= threshold)
    .slice(0, limit);
}

/**
 * Render the citation block for a panel.
 *
 * When more sources qualify than the block cites, the omission is stated so a
 * reader never assumes the list is complete.
 */
export function formatCitationBlock(panel: CitationPanel): string {
  const relevant = filterRelevantSources(panel.sources);
  if (relevant.length === 0) return "";

  let block = "## Sources\n\n";
  for (const source of relevant) {
    const title = String(source.title ?? "").trim() || "(untitled source)";
    const snippet = String(source.snippet ?? "").trim();
    block += "- [" + title + "](" + (source.url || "#") + ")" + (snippet ? " - " + snippet : "") + "\n";
  }
  const eligible = (panel.sources ?? []).filter(
    (source) => Number.isFinite(source?.relevance) && source.relevance >= 0.5,
  ).length;
  const omitted = eligible - relevant.length;
  if (omitted > 0) {
    block += "\n*" + omitted + " additional source" + (omitted === 1 ? "" : "s") + " met the relevance threshold and were not cited.*\n";
  }
  block += "\n*Retrieved: " + new Date(panel.generatedAt).toISOString() + "*\n";
  return block;
}

export function createMockSources(query: string): CitationSource[] {
  return [
    {
      id: "src-1",
      title: "Search results for: " + query,
      url: "https://example.com/search?q=" + encodeURIComponent(query),
      snippet: "This is a placeholder citation. Connect a search provider for real results.",
      relevance: 0.8,
      retrievedAt: Date.now(),
    },
  ];
}
