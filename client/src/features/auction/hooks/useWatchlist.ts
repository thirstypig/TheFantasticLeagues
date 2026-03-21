import { useState, useEffect, useCallback } from 'react';
import { track } from '../../../lib/posthog';

export function useWatchlist(leagueId: number | null | undefined) {
  const [starred, setStarred] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!leagueId) {
      setStarred(new Set());
      return;
    }
    const key = `auctionWatchlist_${leagueId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setStarred(new Set(JSON.parse(saved)));
      } catch {
        setStarred(new Set());
      }
    } else {
      setStarred(new Set());
    }
  }, [leagueId]);

  const toggle = useCallback((mlbId: string) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(mlbId)) {
        next.delete(mlbId);
      } else {
        next.add(mlbId);
      }
      return next;
    });
    // Side effects outside the state updater — prevents double-fire under StrictMode
    setStarred(current => {
      if (leagueId) localStorage.setItem(`auctionWatchlist_${leagueId}`, JSON.stringify([...current]));
      track("auction_watchlist_toggle", { action: current.has(mlbId) ? "add" : "remove", count: current.size });
      return current;
    });
  }, [leagueId]);

  return { starred, toggle };
}
