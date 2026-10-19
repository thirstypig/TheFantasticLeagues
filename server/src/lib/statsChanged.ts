// server/src/lib/statsChanged.ts
// "Scoring stats were just written" — a process-local signal (todo #305).
//
// The stats syncers live in `features/players`; the caches that go stale when
// they write live in `features/standings`. ADR-015 forbids one feature module
// importing the other, so the syncer announces the write here and the cache
// owner subscribes. Neither side knows the other exists.
//
// Why it matters: the standings cache used to be TTL-only. Every 120s the first
// request paid a full cold compute, and the sync never told the cache anything,
// so standings could also serve pre-sync numbers for up to two minutes.
//
// Process-local (a Set, no Redis) for the same reason as leagueRuleCache: one
// app server per Railway deploy. If we ever scale out, this becomes a pub/sub.

import { logger } from "./logger.js";

/** `leagueId` undefined = the write was not league-scoped (e.g. daily stats). */
export type StatsChangedListener = (leagueId?: number) => void;

const listeners = new Set<StatsChangedListener>();

/** Subscribe; returns an unsubscribe function. */
export function onStatsChanged(listener: StatsChangedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Tell every subscriber that scoring stats changed. A throwing listener is
 * logged and skipped — a cache failing to clear must never fail the sync that
 * already committed its writes.
 */
export function notifyStatsChanged(leagueId?: number): void {
  for (const listener of listeners) {
    try {
      listener(leagueId);
    } catch (err) {
      logger.error({ error: String(err), leagueId }, "statsChanged listener threw");
    }
  }
}
