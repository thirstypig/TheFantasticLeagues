
import { API_BASE, fetchJsonApi } from '../../api/base';
import { TeamDetailResponse } from '../../api/types';

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
