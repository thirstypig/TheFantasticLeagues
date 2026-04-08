import { useState, useEffect } from "react";
import { fetchJsonApi } from "../api/base";
import type { RosterAlertPlayer } from "../components/shared/RosterAlertAccordion";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface UseRosterStatusResult {
  ilPlayers: RosterAlertPlayer[];
  minorsPlayers: RosterAlertPlayer[];
  allPlayers: RosterAlertPlayer[];
  loading: boolean;
}

export function useRosterStatus(leagueId: number | null, teamId?: number): UseRosterStatusResult {
  const [allPlayers, setAllPlayers] = useState<RosterAlertPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    let ok = true;
    setLoading(true);

    const params = new URLSearchParams({ leagueId: String(leagueId) });
    if (teamId) params.set("teamId", String(teamId));

    fetchJsonApi<{ players: RosterAlertPlayer[] }>(`${API_BASE}/mlb/roster-status?${params}`)
      .then(res => { if (ok) setAllPlayers(res.players || []); })
      .catch(() => { if (ok) setAllPlayers([]); })
      .finally(() => { if (ok) setLoading(false); });

    return () => { ok = false; };
  }, [leagueId, teamId]);

  const ilPlayers = allPlayers.filter(p => p.isInjured);
  const minorsPlayers = allPlayers.filter(p => p.isMinors);

  return { ilPlayers, minorsPlayers, allPlayers, loading };
}
