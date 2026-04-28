/*
 * Weekly Report API client — wraps GET /api/reports/:leagueId/:weekKey?
 * Server endpoint defined at server/src/features/reports/routes.ts.
 * The shape mirrors the server's `WeeklyReport` interface so this file
 * is the contract for the Aurora Weekly Report page.
 */
import { fetchJsonApi } from "../../api/base";

export interface WeeklyReportMeta {
  leagueId: number;
  leagueName: string;
  weekKey: string;
  label: string;
  generatedAt: string | null;
  isCurrentWeek: boolean;
}

export interface WeeklyReportDigest {
  available: boolean;
  data: Record<string, unknown> | null;
}

export interface WeeklyReportTeamInsight {
  teamId: number;
  teamName: string;
  available: boolean;
  data: Record<string, unknown> | null;
}

export interface WeeklyReportActivity {
  id: number;
  at: string;
  type: string | null;
  teamName: string | null;
  playerName: string | null;
}

export interface WeeklyReportStandingsRow {
  rank: number;
  teamId: number;
  teamName: string;
  totalPoints: number;
}

export interface WeeklyReport {
  meta: WeeklyReportMeta;
  digest: WeeklyReportDigest;
  teamInsights: WeeklyReportTeamInsight[];
  activity: WeeklyReportActivity[];
  standings: { rows: WeeklyReportStandingsRow[] };
}

export async function getWeeklyReport(leagueId: number, weekKey?: string): Promise<WeeklyReport> {
  const path = weekKey
    ? `/api/reports/${leagueId}/${encodeURIComponent(weekKey)}`
    : `/api/reports/${leagueId}`;
  return fetchJsonApi<WeeklyReport>(path);
}
