
import { API_BASE, fetchJsonApi } from '../../api/base';
import { track } from '../../lib/posthog';
import {
  LeaguesListResponse,
  LeagueDetail,
  AdminCreateLeagueInput,
  AdminCreateLeagueResponse,
  LeagueRule
} from '../../api/types';

export async function getLeagues(): Promise<LeaguesListResponse> {
  return fetchJsonApi<LeaguesListResponse>(`${API_BASE}/leagues`);
}

export async function getLeague(id: number | string): Promise<{ league: LeagueDetail }> {
  return fetchJsonApi<{ league: LeagueDetail }>(`${API_BASE}/leagues/${id}`);
}

export async function adminCreateLeague(input: AdminCreateLeagueInput): Promise<AdminCreateLeagueResponse> {
  return fetchJsonApi<AdminCreateLeagueResponse>(`${API_BASE}/admin/league`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminDeleteLeague(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/admin/league/${leagueId}`, { method: "DELETE" });
}


export async function getLeagueRules(leagueId: number): Promise<{ rules: LeagueRule[] }> {
    return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/rules`);
}

export async function saveLeagueRule(leagueId: number, rule: Partial<LeagueRule>): Promise<{ rule: LeagueRule }> {
    return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/rules`, {
        method: "POST",
        body: JSON.stringify(rule)
    });
}

export async function endAuction(leagueId: number): Promise<{ success: boolean; snapshotted: number }> {
    return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/end-auction`, { method: "POST" });
}

export async function adminImportRosters(leagueId: number, csvContent: string): Promise<{ success: boolean; count: number; errors: string[] }> {
    // CSV content needs special Content-Type, so we use fetchJsonApi with explicit header
    return fetchJsonApi(`${API_BASE}/admin/league/${leagueId}/import-rosters`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csvContent,
    });
}

export async function getMyRoster(leagueId: number): Promise<{ team: any; roster: any[]; isLocked: boolean; keeperLimit: number }> {
    return fetchJsonApi<{ team: any; roster: any[]; isLocked: boolean; keeperLimit: number }>(`${API_BASE}/leagues/${leagueId}/my-roster`);
}

export async function saveKeepers(leagueId: number, keeperIds: number[]): Promise<{ success: boolean; count: number }> {
    const result = await fetchJsonApi<{ success: boolean; count: number }>(`${API_BASE}/leagues/${leagueId}/my-roster/keepers`, {
        method: "POST",
        body: JSON.stringify({ keeperIds })
    });
    track("keepers_save", { keeper_count: keeperIds.length });
    return result;
}

// ─── Invite Code ───

export async function joinLeague(inviteCode: string): Promise<{ league: { id: number; name: string; season: number } }> {
    return fetchJsonApi(`${API_BASE}/leagues/join`, {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
    });
}

export async function getInviteCode(leagueId: number): Promise<{ inviteCode: string | null }> {
    return fetchJsonApi(`${API_BASE}/leagues/${leagueId}/invite-code`);
}

export async function regenerateInviteCode(leagueId: number): Promise<{ inviteCode: string }> {
    return fetchJsonApi(`${API_BASE}/leagues/${leagueId}/invite-code/regenerate`, {
        method: "POST",
    });
}
