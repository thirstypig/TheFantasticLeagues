// server/src/lib/leagueRuleCache.ts
// Process-local cache for LeagueRule values.
//
// Rules change via commissioner action (rare). Reads happen on every mutation
// path — rosterGuard, ilSlotGuard, the new transactions auth middleware, and
// ad-hoc call sites like getLeagueStatsSource. Hitting Postgres for each read
// is wasteful: a single `/transactions/claim` was firing 3 separate
// LeagueRule queries pre-cache (rosterGuard + ilSlotGuard + the new auth
// middleware). With this cache, those collapse to at most one fetch per
// league per 60-second window.
//
// Cache is process-local (single Map, no Redis) — we only have one app server
// per Railway deploy and rule edits are always behind commissioner auth, so
// coordinating across instances isn't load-bearing yet. If we ever scale out,
// swap the Map for a short-TTL Redis key or emit an invalidation event.
//
// Consistency model:
//   - Writes (commissioner rule edits) MUST call `invalidateLeagueRules` so
//     the next read refreshes. See `CommissionerService.updateRules`,
//     `lockRules`, `unlockRules`, and `features/leagues/rules-routes.ts`.
//   - Reads inside a transaction (`$transaction(tx => ...)`) use the cache —
//     they do NOT see uncommitted rule writes from another concurrent
//     transaction. Rules rarely change during a mutation, and the alternative
//     (every transaction re-reads every rule row) is the performance problem
//     this cache solves.

type RuleRow = { category: string; key: string; value: string };

type PrismaLike = {
  leagueRule: {
    findMany: (args: {
      where: { leagueId: number };
      select: { category: true; key: true; value: true };
    }) => Promise<RuleRow[]>;
  };
};

export type LeagueRuleMap = Record<string, Record<string, string>>;

interface Entry {
  at: number;
  rules: LeagueRuleMap;
}

const TTL_MS = 60_000;
const cache = new Map<number, Entry>();

/**
 * Load all rules for a league, grouped `{ category: { key: value } }`.
 *
 * Accepts a Prisma-like client so callers already inside a `$transaction`
 * can pass their tx — on cache miss, the fetch runs against that client.
 * On cache hit, the client argument is unused (the cached value is returned
 * without any DB round-trip).
 *
 * Returns a fresh object graph; callers may safely mutate the returned map
 * (though they shouldn't — treat it as read-only).
 */
export async function getLeagueRules(
  client: PrismaLike,
  leagueId: number,
): Promise<LeagueRuleMap> {
  const hit = cache.get(leagueId);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.rules;
  }

  const rows = await client.leagueRule.findMany({
    where: { leagueId },
    select: { category: true, key: true, value: true },
  });

  const rules: LeagueRuleMap = {};
  for (const row of rows) {
    (rules[row.category] ??= {})[row.key] = row.value;
  }

  cache.set(leagueId, { at: Date.now(), rules });
  return rules;
}

/**
 * Drop the cached rules for a league. Callers that write to `LeagueRule` MUST
 * invoke this for the affected league so subsequent reads see the new value.
 */
export function invalidateLeagueRules(leagueId: number): void {
  cache.delete(leagueId);
}

/**
 * Test-only: drop the entire cache. Call in `beforeEach` to prevent cross-
 * test pollution when production code paths use the cache implicitly.
 */
export function _clearLeagueRuleCache(): void {
  cache.clear();
}
