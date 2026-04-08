import { useState, useEffect } from "react";
import { fetchJsonApi, API_BASE } from "../api/base";

export interface PlayerNewsItem {
  source: string;
  title: string;
  link: string;
  pubDate: string;
}

/**
 * Fetch news articles mentioning a player by name.
 * Uses the server-side /api/mlb/player-news endpoint which aggregates
 * and filters 4 cached RSS feeds (Trade Rumors, Yahoo, MLB.com, ESPN).
 */
export function usePlayerNews(playerName: string | null): {
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

    fetchJsonApi<{ articles: PlayerNewsItem[] }>(
      `${API_BASE}/mlb/player-news?playerName=${encodeURIComponent(playerName)}`
    )
      .then(res => { if (ok) setArticles(res.articles || []); })
      .catch(() => { if (ok) setArticles([]); })
      .finally(() => { if (ok) setLoading(false); });

    return () => { ok = false; };
  }, [playerName]);

  return { articles, loading };
}
