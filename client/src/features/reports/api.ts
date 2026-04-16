import { fetchJsonApi, API_BASE } from "../../api/base";

export interface WeeklyReport {
  meta: {
    leagueId: number;
    leagueName: string;
    weekKey: string;
    label: string;
    generatedAt: string | null;
    isCurrentWeek: boolean;
  };
  digest: {
    available: boolean;
    data: Record<string, unknown> | null;
  };
  teamInsights: Array<{
    teamId: number;
    teamName: string;
    available: boolean;
    data: Record<string, unknown> | null;
  }>;
  activity: Array<{
    id: number;
    at: string;
    type: string | null;
    teamName: string | null;
    playerName: string | null;
    raw: string | null;
  }>;
  standings: {
    rows: Array<{
      rank: number;
      teamId: number;
      teamName: string;
      totalPoints: number;
    }>;
    available: boolean;
  };
}

export async function getWeeklyReport(leagueId: number, weekKey?: string): Promise<WeeklyReport> {
  const path = weekKey ? `/reports/${leagueId}/${weekKey}` : `/reports/${leagueId}`;
  return fetchJsonApi<WeeklyReport>(`${API_BASE}${path}`);
}
