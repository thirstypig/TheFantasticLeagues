import React, { createContext, useContext, useEffect, useState } from 'react';
import { getLeagues } from '../api';
import { useAuth } from '../auth/AuthProvider';
import type { LeagueListItem } from '../api/types';

interface LeagueContextType {
  leagueId: number;
  setLeagueId: (id: number) => void;
  leagues: LeagueListItem[];
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const STORAGE_KEY = 'fbst-league-id';

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [leagueId, setLeagueIdState] = useState<number>(() => {
    // Default to user's first membership league, falling back to stored or 1
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

  const setLeagueId = (id: number) => {
    setLeagueIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  return (
    <LeagueContext.Provider value={{ leagueId, setLeagueId, leagues }}>
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
