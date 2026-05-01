/**
 * In-memory TTL cache for `/api/players` list responses (todo #137).
 *
 * The endpoint hits on every team page load and was over-fetching the entire
 * Player table (~1k rows) on every request. Production runs `connection_limit=1`
 * against Supabase so each request also serializes through one connection.
 *
 * Cache strategy:
 *   - Key on (leagueId, availability, type) — the only inputs that change the
 *     response shape. Different leagues see different rosters; availability and
 *     type filters are pushed into Prisma so cached payloads are already filtered.
 *   - TTL 60s — Player + Roster mutations come from claim/drop/il-stash/il-activate
 *     which call `clearPlayersCache(leagueId)` synchronously after the transaction
 *     commits. The TTL is a safety net for cases the explicit invalidation misses
 *     (admin tools, direct DB writes, etc.).
 *   - Stampede prevention via `pending` Promise — second concurrent miss waits on
 *     the first instead of issuing parallel queries. Mirrors `standingsCache` in
 *     services/standingsService.ts and the dashboard service cache.
 */

const TTL_MS = 60_000;

interface CacheEntry<T> {
  data?: T;
  expiry: number;
  pending?: Promise<T>;
}

const caches = new Map<string, CacheEntry<unknown>>();

function makeKey(leagueId: number | null, availability: string, type: string): string {
  return `${leagueId ?? "anon"}|${availability}|${type}`;
}

export async function withPlayersCache<T>(
  leagueId: number | null,
  availability: string,
  type: string,
  loader: () => Promise<T>,
): Promise<T> {
  const key = makeKey(leagueId, availability, type);
  const cached = caches.get(key) as CacheEntry<T> | undefined;
  if (cached?.data !== undefined && cached.expiry > Date.now()) return cached.data;
  if (cached?.pending) return cached.pending;

  const pending = loader();
  caches.set(key, { data: cached?.data, expiry: 0, pending } as CacheEntry<unknown>);
  try {
    const result = await pending;
    caches.set(key, { data: result, expiry: Date.now() + TTL_MS } as CacheEntry<unknown>);
    return result;
  } catch (err) {
    caches.delete(key);
    throw err;
  }
}

/**
 * Invalidate every cached entry for a league. Called from the transaction
 * handlers (claim, drop, il-stash, il-activate) immediately after the
 * underlying $transaction resolves.
 *
 * Pass no argument to flush every league (used by tests).
 */
export function clearPlayersCache(leagueId?: number | null): void {
  if (leagueId === undefined || leagueId === null) {
    caches.clear();
    return;
  }
  const prefix = `${leagueId}|`;
  for (const key of caches.keys()) {
    if (key.startsWith(prefix)) caches.delete(key);
  }
}

/** Test helper — exposes raw size for assertions. */
export function _playersCacheSize(): number {
  return caches.size;
}
