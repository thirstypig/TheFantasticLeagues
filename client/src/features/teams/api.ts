
import { API_BASE, fetchJsonApi } from '../../api/base';
import { TeamDetailResponse } from '../../api/types';
import { track } from '../../lib/posthog';
import type { RosterHubResponse } from '@shared/api/teams';

export async function getTeamDetails(teamId: number): Promise<TeamDetailResponse> {
  return fetchJsonApi<TeamDetailResponse>(`${API_BASE}/teams/${teamId}/summary`);
}

/**
 * GET /api/teams/:id/roster-hub — server-shaped hub roster.
 *
 * Returns hitters / pitchers / IL rows pre-joined with stats and partitioned
 * server-side. Replaces the legacy client-side join of
 * `getTeamDetails().currentRoster` × `getPlayerSeasonStatsMeta(leagueId).stats`
 * (todo #140). The wire format is `RosterHubResponse` from `@shared/api/teams`.
 */
export async function getTeamRosterHub(teamId: number): Promise<RosterHubResponse & { computedAt: string | null }> {
  return fetchJsonApi(`${API_BASE}/teams/${teamId}/roster-hub`);
}

export async function getTeams(leagueId?: number): Promise<any[]> {
  const params = leagueId ? `?leagueId=${leagueId}` : '';
  const resp = await fetchJsonApi<{ teams: any[] }>(`${API_BASE}/teams${params}`);
  return resp.teams;
}

export async function updateRosterPosition(
  teamId: number,
  rosterId: number,
  position: string | null,
  /**
   * Optional commissioner-mode backdate. Advisory only — the swap doesn't
   * update Roster.acquiredAt today (server logs it for audit, doesn't
   * recompute period stats). Pass YYYY-MM-DD or full ISO datetime.
   */
  effectiveDate?: string,
): Promise<any> {
  const body: Record<string, unknown> = { assignedPosition: position };
  if (effectiveDate) body.effectiveDate = effectiveDate;
  return fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// --- Period Roster ---

export interface PeriodRosterEntry {
  id: number;
  playerId: number;
  mlbId: number | null;
  name: string;
  posPrimary: string;
  posList: string;
  mlbTeam: string | null;
  acquiredAt: string;
  releasedAt: string | null;
  source: string;
  price: number;
  assignedPosition: string | null;
  isActive: boolean;
  periodStats: any | null;
}

export async function getTeamPeriodRoster(teamId: number, periodId: number): Promise<{
  period: { id: number; name: string; startDate: string; endDate: string };
  roster: PeriodRosterEntry[];
}> {
  return fetchJsonApi(`${API_BASE}/teams/${teamId}/period-roster?periodId=${periodId}`);
}

// --- Trade Block ---

export async function getTradeBlock(teamId: number): Promise<{ playerIds: number[] }> {
  return fetchJsonApi<{ playerIds: number[] }>(`${API_BASE}/teams/${teamId}/trade-block`);
}

export async function saveTradeBlock(teamId: number, playerIds: number[]): Promise<{ playerIds: number[] }> {
  return fetchJsonApi<{ playerIds: number[] }>(`${API_BASE}/teams/${teamId}/trade-block`, {
    method: 'POST',
    body: JSON.stringify({ playerIds }),
  });
}

export async function getLeagueTradeBlocks(leagueId: number): Promise<{ tradeBlocks: Record<number, number[]> }> {
  return fetchJsonApi<{ tradeBlocks: Record<number, number[]> }>(
    `${API_BASE}/teams/trade-block/league?leagueId=${leagueId}`
  );
}

// --- AI Weekly Insights ---

export interface TeamInsight {
  category: string;
  title: string;
  detail: string;
}

export interface TeamInsightsResult {
  insights: TeamInsight[];
  overallGrade: string;
}

export async function getTeamAiInsights(leagueId: number, teamId: number): Promise<TeamInsightsResult> {
  const result = await fetchJsonApi<TeamInsightsResult>(
    `${API_BASE}/teams/ai-insights?leagueId=${leagueId}&teamId=${teamId}`
  );
  track("ai_team_insights_requested", { leagueId, teamId });
  return result;
}

export interface WeeklyInsightEntry extends TeamInsightsResult {
  weekKey: string;
  generatedAt: string;
  mode?: string;
}

export async function getTeamAiInsightsHistory(
  leagueId: number,
  teamId: number,
  limit = 8,
): Promise<{ weeks: WeeklyInsightEntry[] }> {
  return fetchJsonApi<{ weeks: WeeklyInsightEntry[] }>(
    `${API_BASE}/teams/ai-insights/history?leagueId=${leagueId}&teamId=${teamId}&limit=${limit}`
  );
}
