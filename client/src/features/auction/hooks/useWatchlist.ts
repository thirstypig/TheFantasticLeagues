import { useState, useEffect, useCallback } from 'react';

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
      if (leagueId) localStorage.setItem(`auctionWatchlist_${leagueId}`, JSON.stringify([...next]));
      return next;
    });
  }, [leagueId]);

  return { starred, toggle };
}
