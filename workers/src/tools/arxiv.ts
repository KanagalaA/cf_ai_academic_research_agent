/**
 * arXiv Tool — Searches arXiv's public API for academic papers.
 *
 * Uses the arXiv API v1 (Atom feed) via HTTP fetch.
 * No API key required — public access.
 *
 * Docs: https://arxiv.org/help/api/
 */

export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  link: string;
  publishedDate: string;
  categories: string[];
}

/**
 * Search arXiv for papers matching a query string.
 *
 * @param query     - Search query (keywords, title, author, etc.)
 * @param maxResults - Maximum number of results to return (default: 5)
 * @returns Array of ArxivPaper objects
 */
export async function searchArxiv(query: string, maxResults: number = 5): Promise<ArxivPaper[]> {
  // arXiv "all:phrase" does exact phrase matching and returns 0 results for long queries.
  // Split into meaningful terms, filter stopwords, AND them for broad matching.
  const stopwords = new Set(['for','the','and','using','with','from','into','that','this','are','can','per','via']);
  const terms = query.trim().split(/\s+/).filter(t => t.length > 3 && !stopwords.has(t.toLowerCase()));
  const searchExpr = terms.length > 1
    ? terms.map(t => `all:${encodeURIComponent(t)}`).join('+AND+')
    : `all:${encodeURIComponent(query.trim())}`;
  const url = `https://export.arxiv.org/api/query?search_query=${searchExpr}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

  console.log('arXiv searching:', query, 'url:', url);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Accept': 'application/atom+xml', 'User-Agent': 'ResearchAgent/1.0' },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });
  } catch (err: any) {
    console.error('arXiv fetch error for query "' + query + '":', err?.message || err);
    return [];
  }

  if (!response.ok) {
    console.error('arXiv API error:', response.status, 'for query:', query);
    return [];
  }

  const text = await response.text();
  console.log('arXiv response length:', text.length, 'for query:', query);
  const papers = parseArxivAtom(text);
  console.log('arXiv parsed', papers.length, 'papers for query:', query);
  return papers;
}

/**
 * Parse arXiv Atom XML feed into structured paper objects.
 * Uses simple string parsing to avoid needing a DOM parser in Workers.
 */
function parseArxivAtom(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Split on <entry> tags
  const entries = xml.split('<entry>').slice(1);

  for (const entry of entries) {
    try {
      const id = extractTag(entry, 'id')?.split('/abs/')?.pop()?.trim() || '';
      const title = cleanText(extractTag(entry, 'title') || '');
      const abstract = cleanText(extractTag(entry, 'summary') || '');
      const published = extractTag(entry, 'published') || '';
      const publishedDate = published ? new Date(published).toISOString().split('T')[0] : '';

      // Extract link — look for alternate link
      const linkMatch = entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
      const link = linkMatch ? linkMatch[1] : `https://arxiv.org/abs/${id}`;

      // Extract authors
      const authorMatches = entry.matchAll(/<name>([^<]+)<\/name>/g);
      const authors = Array.from(authorMatches).map(m => m[1].trim());

      // Extract categories
      const categoryMatches = entry.matchAll(/<category[^>]*term="([^"]+)"/g);
      const categories = Array.from(categoryMatches).map(m => m[1]);

      if (id && title) {
        papers.push({ id, title, authors, abstract, link, publishedDate, categories });
      }
    } catch (e) {
      console.error('Error parsing arXiv entry:', e);
    }
  }

  return papers;
}

/** Extract content between opening and closing XML tags. */
function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : null;
}

/** Clean whitespace and XML entities from text. */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}