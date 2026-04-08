import { useState, useEffect } from "react";
import { fetchJsonApi } from "../api/base";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export interface PlayerNewsItem {
  source: "Trade Rumors" | "Reddit" | "ESPN" | "MLB.com" | "Yahoo";
  title: string;
  link: string;
  pubDate: string;
}

/**
 * Fetch news articles mentioning a player by name from the 5 existing RSS feed endpoints.
 * Filters client-side by last name match (≥5 chars) or full name match.
 */
export function usePlayerNews(playerName: string | null, leagueId?: number | null): {
  articles: PlayerNewsItem[];
  loading: boolean;
} {
  const [articles, setArticles] = useState<PlayerNewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerName) return;
    let ok = true;
    setLoading(true);
    setArticles([]);

    const parts = playerName.trim().split(/\s+/);
    const lastName = parts[parts.length - 1]?.toLowerCase() || "";
    const fullName = playerName.trim().toLowerCase();
    // Skip matching for very short last names (avoid "Lee", "May" false positives)
    const canMatchByLastName = lastName.length >= 5;

    const matchesPlayer = (text: string): boolean => {
      const lower = text.toLowerCase();
      if (lower.includes(fullName)) return true;
      if (canMatchByLastName && lower.includes(lastName)) return true;
      return false;
    };

    const leagueParam = leagueId ? `?leagueId=${leagueId}` : "";

    Promise.allSettled([
      fetchJsonApi<{ items: { title: string; link: string; pubDate: string; categories?: string[] }[] }>(`${API_BASE}/mlb/trade-rumors`),
      fetchJsonApi<{ posts: { title: string; url?: string; permalink?: string; createdUtc?: number }[] }>(`${API_BASE}/mlb/reddit-baseball${leagueParam}`),
      fetchJsonApi<{ articles: { title: string; link: string; pubDate: string }[] }>(`${API_BASE}/mlb/yahoo-sports`),
      fetchJsonApi<{ articles: { title: string; link: string; pubDate: string }[] }>(`${API_BASE}/mlb/mlb-news`),
      fetchJsonApi<{ articles: { title: string; link: string; pubDate: string }[] }>(`${API_BASE}/mlb/espn-news`),
    ]).then(([rumorsR, redditR, yahooR, mlbR, espnR]) => {
      if (!ok) return;

      const matched: PlayerNewsItem[] = [];

      // Trade Rumors — match title or categories
      if (rumorsR.status === "fulfilled") {
        for (const item of rumorsR.value.items || []) {
          const catMatch = item.categories?.some(c => c.toLowerCase().includes(lastName));
          if (matchesPlayer(item.title) || (canMatchByLastName && catMatch)) {
            matched.push({ source: "Trade Rumors", title: item.title, link: item.link, pubDate: item.pubDate });
          }
        }
      }

      // Reddit — match title
      if (redditR.status === "fulfilled") {
        for (const post of redditR.value.posts || []) {
          if (matchesPlayer(post.title)) {
            const link = post.permalink ? `https://reddit.com${post.permalink}` : (post.url || "");
            const pubDate = post.createdUtc ? new Date(post.createdUtc * 1000).toISOString() : "";
            matched.push({ source: "Reddit", title: post.title, link, pubDate });
          }
        }
      }

      // Yahoo, MLB.com, ESPN — same shape
      const articleFeeds: [PromiseSettledResult<{ articles: { title: string; link: string; pubDate: string }[] }>, PlayerNewsItem["source"]][] = [
        [yahooR, "Yahoo"],
        [mlbR, "MLB.com"],
        [espnR, "ESPN"],
      ];
      for (const [result, source] of articleFeeds) {
        if (result.status === "fulfilled") {
          for (const a of result.value.articles || []) {
            if (matchesPlayer(a.title)) {
              matched.push({ source, title: a.title, link: a.link, pubDate: a.pubDate });
            }
          }
        }
      }

      // Sort by date descending, limit to 5
      matched.sort((a, b) => {
        const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return db - da;
      });

      setArticles(matched.slice(0, 5));
    }).finally(() => {
      if (ok) setLoading(false);
    });

    return () => { ok = false; };
  }, [playerName, leagueId]);

  return { articles, loading };
}
