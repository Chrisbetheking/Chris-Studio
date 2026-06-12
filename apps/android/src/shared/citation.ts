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

export function createCitationPanel(query: string, sources: CitationSource[]): CitationPanel {
  return {
    query,
    sources: sources.sort((a, b) => b.relevance - a.relevance),
    generatedAt: Date.now(),
  };
}

export function filterRelevantSources(
  sources: CitationSource[],
  minRelevance: number = 0.5,
  maxSources: number = 5
): CitationSource[] {
  return sources
    .filter((s) => s.relevance >= minRelevance)
    .slice(0, maxSources);
}

export function formatCitationBlock(panel: CitationPanel): string {
  const relevant = filterRelevantSources(panel.sources);
  if (relevant.length === 0) return "";

  let block = "## Sources\n\n";
  for (const source of relevant) {
    block += "- [" + source.title + "](" + (source.url || "#") + ") - " + source.snippet + "\n";
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
