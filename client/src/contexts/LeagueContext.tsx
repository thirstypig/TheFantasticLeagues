import React, { createContext, useContext, useEffect, useState } from 'react';
import { getLeagues } from '../api';
import { fetchJsonApi, API_BASE } from '../api/base';
import { useAuth } from '../auth/AuthProvider';
import type { LeagueListItem } from '../api/types';

interface LeagueContextType {
  leagueId: number;
  setLeagueId: (id: number) => void;
  leagues: LeagueListItem[];
  outfieldMode: string;
  currentLeagueName: string;
  currentSeason: number;
  leagueSeasons: LeagueListItem[];
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const STORAGE_KEY = 'fbst-league-id';

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [outfieldMode, setOutfieldMode] = useState("OF");
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

  useEffect(() => {
    if (user) {
      getLeagues()
        .then((resp) => setLeagues(resp.leagues ?? []))
        .catch(() => setLeagues([]));
    } else {
      setLeagues([]);
    }
  }, [user]);

  // Fetch outfield mode when league changes
  useEffect(() => {
    if (!user || !leagueId) return;
    fetchJsonApi<{ league: { outfieldMode?: string } }>(`${API_BASE}/leagues/${leagueId}`)
      .then((res) => setOutfieldMode(res?.league?.outfieldMode || "OF"))
      .catch(() => setOutfieldMode("OF"));
  }, [user, leagueId]);

  const setLeagueId = (id: number) => {
    setLeagueIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  const currentLeague = leagues.find(l => l.id === leagueId);
  const currentLeagueName = currentLeague?.name ?? "";
  const currentSeason = currentLeague?.season ?? 0;
  const leagueSeasons = leagues.filter(l => l.name === currentLeagueName);

  return (
    <LeagueContext.Provider value={{ leagueId, setLeagueId, leagues, outfieldMode, currentLeagueName, currentSeason, leagueSeasons }}>
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
