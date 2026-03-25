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

interface LeagueContextType {
  leagueId: number;
  setLeagueId: (id: number) => void;
  leagues: LeagueListItem[];
  outfieldMode: string;
  scoringFormat: string;
  currentLeagueName: string;
  currentSeason: number;
  currentFranchiseId: number;
  leagueSeasons: LeagueListItem[];
  seasonStatus: SeasonStatus | null;
  myTeamId: number | null;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const STORAGE_KEY = 'fbst-league-id';

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [outfieldMode, setOutfieldMode] = useState("OF");
  const [scoringFormat, setScoringFormat] = useState("ROTO");
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
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

  useEffect(() => {
    if (user) {
      getLeagues()
        .then((resp) => setLeagues(resp.leagues ?? []))
        .catch(() => setLeagues([]));
    } else {
      setLeagues([]);
    }
  }, [user]);

  // Fetch league detail (outfieldMode + myTeamId) — single request, atomic derivation
  useEffect(() => {
    if (!user || !leagueId) return;
    let canceled = false;

    // Reset synchronously to prevent stale cross-league contamination
    setOutfieldMode("OF");
    setScoringFormat("ROTO");
    setMyTeamId(null);

    fetchJsonApi<{ league: { outfieldMode?: string; scoringFormat?: string; teams?: LeagueTeam[] } }>(
      `${API_BASE}/leagues/${leagueId}`
    ).then(res => {
      if (canceled) return;
      setOutfieldMode(res?.league?.outfieldMode || "OF");
      setScoringFormat(res?.league?.scoringFormat || "ROTO");
      const mine = findMyTeam(res?.league?.teams ?? [], Number(user.id));
      setMyTeamId(mine?.id ?? null);
    }).catch(() => {
      if (canceled) return;
      setOutfieldMode("OF");
      setMyTeamId(null);
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

  const setLeagueId = useCallback((id: number) => {
    setLeagueIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const currentLeague = leagues.find(l => l.id === leagueId);
  const currentLeagueName = currentLeague?.name ?? "";
  const currentSeason = currentLeague?.season ?? 0;
  const currentFranchiseId = currentLeague?.franchiseId ?? 0;

  const leagueSeasons = useMemo(
    () => currentFranchiseId
      ? leagues.filter(l => l.franchiseId === currentFranchiseId)
      : leagues.filter(l => l.name === currentLeagueName),
    [leagues, currentFranchiseId, currentLeagueName]
  );

  const contextValue = useMemo(() => ({
    leagueId, setLeagueId, leagues, outfieldMode, scoringFormat,
    currentLeagueName, currentSeason, currentFranchiseId,
    leagueSeasons, seasonStatus, myTeamId,
  }), [leagueId, setLeagueId, leagues, outfieldMode, scoringFormat,
       currentLeagueName, currentSeason, currentFranchiseId,
       leagueSeasons, seasonStatus, myTeamId]);

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
