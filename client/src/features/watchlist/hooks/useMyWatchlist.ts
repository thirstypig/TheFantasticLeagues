/**
 * Shared watchlist state hook for "my team's" DB-backed watchlist.
 * Consumed by any page that renders a player row and wants a star CTA:
 * Players, Activity/AddDropTab, Trades asset selector, etc.
 *
 * The auction screens have no starred watchlist (dropped in UX step F); a
 * team's auction "my list" lives on the server (features/auction/hooks/useMyList.ts).
 */

import { useCallback, useEffect, useState } from "react";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "../api";
import { reportError } from "../../../lib/errorBus";

export interface UseMyWatchlistResult {
  /** Set of DB Player.id values currently starred on this user's team watchlist. */
  watchedIds: Set<number>;
  /** Player.ids currently awaiting an API response (for spinner/disable states). */
  pendingIds: Set<number>;
  /** Toggle a player on/off the watchlist. Optimistic with rollback on failure. */
  toggle: (playerId: number, isCurrentlyWatched: boolean) => Promise<void>;
  /** True when a team context is available — callers gate the star UI on this. */
  canWatch: boolean;
}

export function useMyWatchlist(teamId: number | null | undefined): UseMyWatchlistResult {
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  const canWatch = teamId != null && teamId > 0;

  // Load on team change
  useEffect(() => {
    if (!canWatch) {
      setWatchedIds(new Set());
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await getWatchlist(teamId!);
        if (!alive) return;
        setWatchedIds(new Set(res.items.map((w) => w.player.id)));
      } catch (err) {
        // Silent-fail: toggle still works; just no pre-marked state.
        reportError(err, { source: "watchlist-load" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamId, canWatch]);

  const toggle = useCallback(
    async (playerId: number, isCurrentlyWatched: boolean) => {
      if (!canWatch) return;
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(playerId);
        return next;
      });
      // Optimistic
      setWatchedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyWatched) next.delete(playerId);
        else next.add(playerId);
        return next;
      });
      try {
        if (isCurrentlyWatched) {
          await removeFromWatchlist(playerId, teamId!);
        } else {
          await addToWatchlist({ teamId: teamId!, playerId });
        }
      } catch (err) {
        // Rollback
        setWatchedIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyWatched) next.add(playerId);
          else next.delete(playerId);
          return next;
        });
        reportError(err, {
          source: isCurrentlyWatched ? "watchlist-remove" : "watchlist-add",
        });
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [teamId, canWatch],
  );

  return { watchedIds, pendingIds, toggle, canWatch };
}
