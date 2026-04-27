import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLeagues } from '../api';
import { getCurrentSeason, type SeasonStatus } from '../features/seasons/api';
import { fetchJsonApi, API_BASE } from '../api/base';
import { useAuth } from '../auth/AuthProvider';
import type { LeagueListItem, LeagueTeam } from '../api/types';

/** Find the current user's team from a teams array. */
type TeamLike = { ownerUserId?: number | null; ownerships?: { userId: number }[] };
export function findMyTeam<T extends TeamLike>(teams: T[], userId: number): T | null {
  return teams.find(t =>
    t.ownerUserId === userId ||
    (t.ownerships ?? []).some(o => o.userId === userId)
  ) ?? null;
}

/**
 * All of a league's rules, grouped `{ category: { key: value } }`. Fetched
 * once per leagueId change and shared across the tree so features like the
 * Roster Moves tab can read toggles (e.g. `transactions.owner_self_serve`)
 * without duplicating the fetch or blocking render on their own loader.
 *
 * Mirror shape of `server/src/lib/leagueRuleCache.ts`'s LeagueRuleMap —
 * identical categorization on both sides of the wire.
 */
export type LeagueRuleMap = Record<string, Record<string, string>>;

interface LeagueContextType {
  leagueId: number;
  setLeagueId: (id: number) => void;
  refreshLeagues: () => void;
  leagues: LeagueListItem[];
  sport: string;
  outfieldMode: string;
  scoringFormat: string;
  draftMode: "AUCTION" | "DRAFT";
  currentLeagueName: string;
  currentSeason: number;
  currentFranchiseId: number;
  leagueSeasons: LeagueListItem[];
  seasonStatus: SeasonStatus | null;
  myTeamId: number | null;
  /**
   * The team-code of the user's owned team in the current league, or null
   * when they don't own one. Surfaced alongside `myTeamId` so the sidebar's
   * "My Team" shortcut (PR #132 sitemap reorg) can build `/teams/:teamCode`
   * without a second fetch — `getLeagueDetail` already returns the team
   * data we need.
   */
  myTeamCode: string | null;
  /**
   * Null while rules are loading or unavailable. Empty object means
   * fetched-but-no-rules (e.g. a freshly-created league pre-seed). Consumers
   * must treat undefined keys as absent rather than assuming defaults.
   */
  leagueRules: LeagueRuleMap | null;
  refreshLeagueRules: () => void;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const STORAGE_KEY = 'fbst-league-id';

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [outfieldMode, setOutfieldMode] = useState("OF");
  const [scoringFormat, setScoringFormat] = useState("ROTO");
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  const [myTeamCode, setMyTeamCode] = useState<string | null>(null);
  const [leagueId, setLeagueIdState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : 1;
  });

  // Sync leagueId with user's primary membership
  useEffect(() => {
    if (user?.memberships?.length) {
      const ownerMembership = user.memberships.find(m => m.role === 'OWNER');
      const primaryLeagueId = Number(ownerMembership?.leagueId ?? user.memberships[0].leagueId);
      if (primaryLeagueId && Number.isFinite(primaryLeagueId)) {
        setLeagueIdState(primaryLeagueId);
        localStorage.setItem(STORAGE_KEY, String(primaryLeagueId));
      }
    }
  }, [user]);

  // Validate stored leagueId against actual leagues — fall back if invalid
  useEffect(() => {
    if (leagues.length > 0 && !leagues.some(l => l.id === leagueId)) {
      const fallback = leagues[0].id;
      setLeagueIdState(fallback);
      localStorage.setItem(STORAGE_KEY, String(fallback));
    }
  }, [leagues, leagueId]);

  const refreshLeagues = useCallback(() => {
    if (!user) return;
    getLeagues()
      .then((resp) => setLeagues(resp.leagues ?? []))
      .catch(() => setLeagues([]));
  }, [user]);

  useEffect(() => {
    if (user) {
      refreshLeagues();
    } else {
      setLeagues([]);
    }
  }, [user, refreshLeagues]);

  // Fetch league detail (outfieldMode + myTeamId) — single request, atomic derivation
  useEffect(() => {
    if (!user || !leagueId) return;
    let canceled = false;

    // Reset synchronously to prevent stale cross-league contamination
    setOutfieldMode("OF");
    setScoringFormat("ROTO");
    setMyTeamId(null);
    setMyTeamCode(null);

    fetchJsonApi<{ league: { outfieldMode?: string; scoringFormat?: string; teams?: LeagueTeam[] } }>(
      `${API_BASE}/leagues/${leagueId}`
    ).then(res => {
      if (canceled) return;
      setOutfieldMode(res?.league?.outfieldMode || "OF");
      setScoringFormat(res?.league?.scoringFormat || "ROTO");
      const mine = findMyTeam(res?.league?.teams ?? [], Number(user.id));
      setMyTeamId(mine?.id ?? null);
      setMyTeamCode(mine?.code ?? null);
    }).catch(() => {
      if (canceled) return;
      setOutfieldMode("OF");
      setMyTeamId(null);
      setMyTeamCode(null);
    });

    return () => { canceled = true; };
  }, [user, leagueId]);

  // Fetch current season status when league changes
  const [seasonStatus, setSeasonStatus] = useState<SeasonStatus | null>(null);
  useEffect(() => {
    if (!user || !leagueId) return;
    let canceled = false;
    setSeasonStatus(null);
    getCurrentSeason(leagueId)
      .then((s) => { if (!canceled) setSeasonStatus(s?.status ?? null); })
      .catch(() => { if (!canceled) setSeasonStatus(null); });
    return () => { canceled = true; };
  }, [user, leagueId]);

  // Fetch league rules, grouped by category, when league changes. Shared
  // surface for features that need to read policy toggles (e.g. the
  // Roster Moves tab reads transactions.owner_self_serve). Server endpoint
  // returns `{ rules, grouped, leagueId }`; we normalize to a flat map.
  const [leagueRules, setLeagueRules] = useState<LeagueRuleMap | null>(null);
  const [rulesTick, setRulesTick] = useState(0);
  useEffect(() => {
    if (!user || !leagueId) return;
    let canceled = false;
    setLeagueRules(null);
    fetchJsonApi<{ rules: Array<{ category: string; key: string; value: string }> }>(
      `${API_BASE}/leagues/${leagueId}/rules`,
    )
      .then((res) => {
        if (canceled) return;
        const map: LeagueRuleMap = {};
        for (const r of res.rules ?? []) {
          (map[r.category] ??= {})[r.key] = r.value;
        }
        setLeagueRules(map);
      })
      .catch(() => {
        if (canceled) return;
        // Rules endpoint requires league membership; non-members will 403 here.
        // Fail-to-empty so consumers can still render — they'll treat missing
        // toggles as "off" (their own fail-closed default).
        setLeagueRules({});
      });
    return () => { canceled = true; };
  }, [user, leagueId, rulesTick]);

  const refreshLeagueRules = useCallback(() => setRulesTick((t) => t + 1), []);

  const setLeagueId = useCallback((id: number) => {
    setLeagueIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const currentLeague = leagues.find(l => l.id === leagueId);
  const currentLeagueName = currentLeague?.name ?? "";
  const currentSeason = currentLeague?.season ?? 0;
  const currentFranchiseId = currentLeague?.franchiseId ?? 0;
  const sport = currentLeague?.sport ?? "baseball";
  const draftMode: "AUCTION" | "DRAFT" = currentLeague?.draftMode === "DRAFT" ? "DRAFT" : "AUCTION";

  const leagueSeasons = useMemo(
    () => currentFranchiseId
      ? leagues.filter(l => l.franchiseId === currentFranchiseId)
      : leagues.filter(l => l.name === currentLeagueName),
    [leagues, currentFranchiseId, currentLeagueName]
  );

  const contextValue = useMemo(() => ({
    leagueId, setLeagueId, refreshLeagues, leagues, sport, outfieldMode, scoringFormat, draftMode,
    currentLeagueName, currentSeason, currentFranchiseId,
    leagueSeasons, seasonStatus, myTeamId, myTeamCode,
    leagueRules, refreshLeagueRules,
  }), [leagueId, setLeagueId, refreshLeagues, leagues, sport, outfieldMode, scoringFormat, draftMode,
       currentLeagueName, currentSeason, currentFranchiseId,
       leagueSeasons, seasonStatus, myTeamId, myTeamCode,
       leagueRules, refreshLeagueRules]);

  return (
    <LeagueContext.Provider value={contextValue}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within LeagueProvider');
  }
  return context;
}
