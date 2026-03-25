import { API_BASE, fetchJsonApi } from "../../api/base";

export interface MatchupEntry {
  id: number;
  week: number;
  teamA: { id: number; name: string };
  teamB: { id: number; name: string };
  result: {
    teamA: { catWins: number; catLosses: number; catTies: number; totalPoints: number };
    teamB: { catWins: number; catLosses: number; catTies: number; totalPoints: number };
    categories?: { stat: string; teamAVal: number; teamBVal: number; winner: "A" | "B" | "TIE" }[];
  } | null;
  isPlayoff: boolean;
  playoffRound: number | null;
}

export interface StandingEntry {
  rank: number;
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pct: number;
  gb: number;
  points: number;
}

export async function getMatchups(leagueId: number, week?: number): Promise<{ matchups: MatchupEntry[] }> {
  const url = week ? `${API_BASE}/matchups?leagueId=${leagueId}&week=${week}` : `${API_BASE}/matchups?leagueId=${leagueId}`;
  return fetchJsonApi(url);
}

export async function getMyMatchup(leagueId: number, week: number): Promise<{ matchup: MatchupEntry | null; myTeamId: number }> {
  return fetchJsonApi(`${API_BASE}/matchups/my-matchup?leagueId=${leagueId}&week=${week}`);
}

export async function getH2HStandings(leagueId: number): Promise<{ standings: StandingEntry[] }> {
  return fetchJsonApi(`${API_BASE}/matchups/standings?leagueId=${leagueId}`);
}

export async function generateSchedule(leagueId: number, totalWeeks?: number): Promise<{ success: boolean; matchups: number }> {
  return fetchJsonApi(`${API_BASE}/matchups/generate`, {
    method: "POST",
    body: JSON.stringify({ leagueId, totalWeeks: totalWeeks || 20 }),
  });
}

export async function scoreWeek(leagueId: number, week: number, periodId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/matchups/score`, {
    method: "POST",
    body: JSON.stringify({ leagueId, week, periodId }),
  });
}
