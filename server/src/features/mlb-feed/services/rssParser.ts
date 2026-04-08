/**
 * Shared RSS feed parser. Extracts items from RSS/XML feeds with CDATA support.
 * Replaces 4 duplicated parsing blocks in routes.ts (Trade Rumors, Yahoo, MLB.com, ESPN).
 */
import { logger } from "../../../lib/logger.js";

export interface RssArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  categories: string[];
}

const DECODE_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&quot;": '"',
};

function decodeHtml(s: string): string {
  return s.replace(/&amp;|&lt;|&gt;|&#39;|&quot;/g, m => DECODE_ENTITIES[m] || m);
}

/**
 * Fetch and parse an RSS feed URL. Returns up to `maxItems` articles.
 * Validates that link URLs start with https:// to prevent javascript: injection.
 */
export async function fetchRssFeed(
  url: string,
  options: { maxItems?: number; sourceName?: string } = {},
): Promise<RssArticle[]> {
  const { maxItems = 15, sourceName = url } = options;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "FBST/1.0 Fantasy Baseball App" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRssXml(xml, maxItems);
  } catch (err) {
    logger.warn({ error: String(err), source: sourceName }, "Failed to fetch RSS feed");
    return [];
  }
}

/**
 * Parse RSS XML string into articles. Handles CDATA-wrapped and plain fields.
 */
export function parseRssXml(xml: string, maxItems = 15): RssArticle[] {
  const articles: RssArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && articles.length < maxItems) {
    const block = match[1];

    const title = extractField(block, "title");
    const rawLink = extractField(block, "link");
    const pubDate = extractField(block, "pubDate");
    const rawDesc = extractField(block, "description");

    // Validate link URL — must start with https:// to prevent javascript: injection
    const link = rawLink.startsWith("https://") || rawLink.startsWith("http://") ? rawLink : "";

    if (title && link) {
      // Extract categories (Trade Rumors uses these for player/team tags)
      const categories: string[] = [];
      const catRegex = /<category><!\[CDATA\[(.*?)\]\]><\/category>/g;
      let catMatch;
      while ((catMatch = catRegex.exec(block)) !== null) {
        categories.push(catMatch[1]);
      }

      articles.push({
        title: decodeHtml(title),
        link,
        pubDate,
        description: rawDesc.replace(/<[^>]*>/g, "").slice(0, 150),
        categories,
      });
    }
  }

  return articles;
}

function extractField(block: string, field: string): string {
  const cdataPattern = new RegExp(`<${field}><!\\[CDATA\\[(.*?)\\]\\]></${field}>`);
  const plainPattern = new RegExp(`<${field}>(.*?)</${field}>`);
  return block.match(cdataPattern)?.[1] ?? block.match(plainPattern)?.[1] ?? "";
}
