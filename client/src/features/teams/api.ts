
import { API_BASE, fetchJsonApi } from '../../api/base';
import { TeamDetailResponse } from '../../api/types';
import { track } from '../../lib/posthog';

export async function getTeamDetails(teamId: number): Promise<TeamDetailResponse> {
  return fetchJsonApi<TeamDetailResponse>(`${API_BASE}/teams/${teamId}/summary`);
}

export async function getTeams(leagueId?: number): Promise<any[]> {
  const params = leagueId ? `?leagueId=${leagueId}` : '';
  const resp = await fetchJsonApi<{ teams: any[] }>(`${API_BASE}/teams${params}`);
  return resp.teams;
}

export async function updateRosterPosition(teamId: number, rosterId: number, position: string | null): Promise<any> {
  return fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assignedPosition: position }),
  });
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
