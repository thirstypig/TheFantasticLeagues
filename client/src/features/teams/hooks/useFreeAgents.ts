// client/src/features/teams/hooks/useFreeAgents.ts
//
// Free-agent list fetcher for the FA scenario panel. Returns the
// "available" slice of the league pool — players with no
// `ogba_team_code` / `team` (i.e. not currently rostered) — and
// memoizes the response per leagueId for 60 seconds.
//
// Per direction-lock FA-#1: search is name + MLB team abbr substring
// (case-insensitive). Per FA-#2: filter state is component-local —
// this hook only owns the FETCH, not the filter UX.
// Per FA-#6: sort default is projected $ desc; the panel passes a
// SortMode and the hook sorts the cached result.
//
// The 60s TTL matches the existing `_seasonStatsCache` in
// `client/src/features/players/api.ts` so they invalidate together
// when the user navigates away and the league pool refetches.

import { useEffect, useMemo, useState } from "react";
import { getPlayerSeasonStats } from "../../players/api";
import type { PlayerSeasonStat } from "../../../api/types";

/** Sort modes exposed in the FA panel header (direction-lock FA-#6). */
export type FreeAgentSort =
  | "projected"
  | "trending"
  | "alphabetical"
  | "scarcity";

export interface FreeAgent {
  /** Stable React key — `${mlb_id}-H` or `${mlb_id}-P`. */
  rowKey: string;
  /** MLB stats id — wire key for /api/transactions/claim. */
  mlbId: number;
  /** Prisma Player.id when available; undefined for true-FA rows. */
  playerId?: number;
  name: string;
  /** Comma-separated eligibility list ("OF,2B"). */
  posList: string;
  posPrimary: string;
  mlbTeam: string;
  isPitcher: boolean;
  /** Projected $ value (auction value). 0 when missing — drops to bottom of "projected" sort. */
  projectedDollars: number;
  /** Free-form short stat snapshot for the row body. */
  statSnapshot: string;
}

interface CacheEntry {
  promise: Promise<FreeAgent[]>;
  ts: number;
}

const TTL_MS = 60 * 1000;
const _faCache = new Map<number, CacheEntry>();

/** Internal: build a stat snapshot mirroring AddDropPanel's row labels. */
function snapshotFor(p: PlayerSeasonStat): string {
  if (p.is_pitcher) {
    const ip = p.IP != null ? `${p.IP} IP` : "";
    const k = p.K != null ? `${p.K} K` : "";
    const era = p.ERA != null ? `${p.ERA} ERA` : "";
    return [ip, k, era].filter(Boolean).join(" · ");
  }
  const hr = p.HR != null ? `${p.HR} HR` : "";
  const sb = p.SB != null ? `${p.SB} SB` : "";
  const avg = p.AVG != null ? `${p.AVG} AVG` : "";
  return [hr, sb, avg].filter(Boolean).join(" · ");
}

/** Internal: filter pool → FAs and normalize to the FA panel shape. */
function toFreeAgents(pool: PlayerSeasonStat[]): FreeAgent[] {
  const out: FreeAgent[] = [];
  for (const p of pool) {
    // Mirror AddDropPanel's "no team" filter — anyone without an OGBA
    // team code is an FA. The `team` legacy field is also checked.
    const hasOwner = Boolean(p.ogba_team_code || p.team);
    if (hasOwner) continue;
    const mlbId = Number(p.mlb_id);
    if (!Number.isFinite(mlbId) || mlbId <= 0) continue;
    const name = String(p.player_name || p.name || "").trim();
    if (!name) continue;
    out.push({
      rowKey: String(p.row_id ?? `${mlbId}-${p.is_pitcher ? "P" : "H"}`),
      mlbId,
      playerId: typeof (p as { id?: number }).id === "number"
        ? (p as { id?: number }).id
        : undefined,
      name,
      posList: String(p.positions || p.pos || "").trim(),
      posPrimary: String(p.positions || p.pos || "").trim().split(/[,/| ]+/)[0] ?? "",
      mlbTeam: String(p.mlb_team || p.mlbTeam || "").trim(),
      isPitcher: Boolean(p.is_pitcher ?? p.isPitcher),
      projectedDollars: Number(p.dollar_value ?? p.value ?? 0) || 0,
      statSnapshot: snapshotFor(p),
    });
  }
  return out;
}

/** Internal: 60s TTL cache. */
function fetchFreeAgentsCached(leagueId: number): Promise<FreeAgent[]> {
  const hit = _faCache.get(leagueId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.promise;
  const promise = getPlayerSeasonStats(leagueId).then(toFreeAgents);
  _faCache.set(leagueId, { promise, ts: Date.now() });
  return promise;
}

/**
 * Test-only hatch — clears the in-memory cache between unit tests so
 * each test starts from a known empty state. Mirrors the pattern in
 * `server/src/lib/leagueRuleCache.ts`.
 */
export function _clearFreeAgentCache(): void {
  _faCache.clear();
}

export interface UseFreeAgentsResult {
  data: FreeAgent[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch FAs for a league, cached for 60 seconds. Returns raw FAs;
 * sort + search are applied by `applyFreeAgentFilter` which the panel
 * runs against the result.
 */
export function useFreeAgents(leagueId: number | null | undefined): UseFreeAgentsResult {
  const [data, setData] = useState<FreeAgent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    fetchFreeAgentsCached(leagueId)
      .then((rows) => {
        if (canceled) return;
        setData(rows);
      })
      .catch((err) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load free agents");
      })
      .finally(() => {
        if (canceled) return;
        setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [leagueId]);

  return { data, loading, error };
}

/** Substring case-insensitive match on name + MLB team abbreviation. */
export function matchesFreeAgentQuery(fa: FreeAgent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (fa.name.toLowerCase().includes(q)) return true;
  if (fa.mlbTeam.toLowerCase().includes(q)) return true;
  return false;
}

/**
 * Position-chip filter. The panel renders chips for the canonical
 * fantasy slots (C / 1B / 2B / 3B / SS / OF / DH / SP / RP). Empty
 * filter set → no filter applied. Match is "any chip overlaps the FA's
 * posList token set."
 */
export function matchesFreeAgentPositions(
  fa: FreeAgent,
  active: ReadonlySet<string>,
): boolean {
  if (active.size === 0) return true;
  const tokens = fa.posList
    .split(/[,/| ]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  for (const t of tokens) {
    if (active.has(t)) return true;
  }
  return false;
}

/** Comparator factory for the panel's sort dropdown. */
export function freeAgentComparator(mode: FreeAgentSort): (a: FreeAgent, b: FreeAgent) => number {
  switch (mode) {
    case "projected":
      // Higher $ first; ties broken by alpha for stable rendering.
      return (a, b) => {
        const d = b.projectedDollars - a.projectedDollars;
        if (d !== 0) return d;
        return a.name.localeCompare(b.name);
      };
    case "trending":
      // Trending stub: until we plumb a 7d delta endpoint, fall back
      // to projected-$ desc but keep the option exposed in the UI so
      // the sort dropdown is functional today and gets data later.
      return (a, b) => b.projectedDollars - a.projectedDollars;
    case "alphabetical":
      return (a, b) => a.name.localeCompare(b.name);
    case "scarcity":
      // Fewer eligible positions = scarcer = higher priority. Ties
      // broken by projected-$ desc so deep-pool hitters sort cleanly.
      return (a, b) => {
        const ac = a.posList.split(/[,/| ]+/).filter(Boolean).length || 99;
        const bc = b.posList.split(/[,/| ]+/).filter(Boolean).length || 99;
        if (ac !== bc) return ac - bc;
        return b.projectedDollars - a.projectedDollars;
      };
  }
}
