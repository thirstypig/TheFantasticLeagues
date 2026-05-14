
import { API_BASE, fetchJsonApi } from '../../api/base';
import { TeamDetailResponse, type LeagueTeam } from '../../api/types';
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

export async function getTeams(leagueId?: number): Promise<LeagueTeam[]> {
  const params = leagueId ? `?leagueId=${leagueId}` : '';
  const resp = await fetchJsonApi<{ teams: LeagueTeam[] }>(`${API_BASE}/teams${params}`);
  return resp.teams;
}

/**
 * Server response from `PATCH /api/teams/:teamId/roster/:rosterId` —
 * `{ roster: <updated row> }`. The `roster` field is a structural subset
 * of the Prisma Roster row that the route actually returns
 * (`prisma.roster.update`). Caller currently only reads success/failure;
 * the typed shape exists so a future caller can rely on the field set.
 */
export interface UpdateRosterPositionResponse {
  roster: {
    id: number;
    teamId: number;
    playerId: number;
    assignedPosition: string | null;
    acquiredAt: string;
    releasedAt: string | null;
    source: string;
    price: number | null;
    isKeeper?: boolean | null;
  };
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
): Promise<UpdateRosterPositionResponse> {
  const body: Record<string, unknown> = { assignedPosition: position };
  if (effectiveDate) body.effectiveDate = effectiveDate;
  return fetchJsonApi<UpdateRosterPositionResponse>(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// --- Period Roster ---

/**
 * Per-period stat shape carried by `GET /api/teams/:id/period-roster` rows.
 * Mirrors the same shape that `TeamDetailResponse.currentRoster[].periodStats`
 * declares in `client/src/api/types.ts` — both are produced by the same
 * server-side join on `PlayerStatsPeriod`. Was `any | null` (todo #121).
 */
export interface PeriodRosterStats {
  W: number;
  SV: number;
  K: number;
  IP: number;
  ER: number;
  BB_H: number;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AB: number;
  H: number;
}

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
  periodStats: PeriodRosterStats | null;
}

export async function getTeamPeriodRoster(teamId: number, periodId: number): Promise<{
  period: { id: number; name: string; startDate: string; endDate: string };
  roster: PeriodRosterEntry[];
}> {
  return fetchJsonApi(`${API_BASE}/teams/${teamId}/period-roster?periodId=${periodId}`);
}

export interface TeamPlayerSeasonStat {
  playerId: number;
  AB: number;
  H: number;
  HR: number;
  R: number;
  RBI: number;
  SB: number;
  W: number;
  SV: number;
  K: number;
  IP: number;
  ER: number;
  BB_H: number;
  AVG: number;
  ERA: number;
  WHIP: number;
}

export async function getTeamPlayerSeasonStats(teamId: number): Promise<{ stats: TeamPlayerSeasonStat[] }> {
  return fetchJsonApi(`${API_BASE}/teams/${teamId}/player-season-stats`);
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
