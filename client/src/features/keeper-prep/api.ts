// client/src/features/keeper-prep/api.ts
import { API_BASE, fetchJsonApi, fetchWithAuth } from "../../api/base";

export interface TeamKeeperStatus {
  teamId: number;
  teamName: string;
  teamCode: string | null;
  budget: number;
  rosterCount: number;
  keeperCount: number;
  keeperCost: number;
  keeperLimit: number;
  isLocked: boolean;
}

export interface PopulateResponse {
  success: boolean;
  teamsPopulated: number;
  playersAdded: number;
  skipped: string[];
  errors: string[];
}

export async function getKeeperPrepStatus(leagueId: number): Promise<{ statuses: TeamKeeperStatus[]; isLocked: boolean }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/status`);
}

export async function populateRosters(leagueId: number): Promise<PopulateResponse> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/populate`, {
    method: "POST",
  });
}

export async function lockKeepers(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/lock`, {
    method: "POST",
  });
}

export async function unlockKeepers(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/unlock`, {
    method: "POST",
  });
}

export async function getTeamRosterForKeeperPrep(leagueId: number, teamId: number): Promise<{ roster: any[]; keeperLimit: number }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/team/${teamId}/roster`);
}

export async function saveKeepersCommish(leagueId: number, teamId: number, keeperIds: number[]): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/save`, {
    method: "POST",
    body: JSON.stringify({ teamId, keeperIds }),
  });
}

export async function updateRosterPrice(leagueId: number, rosterId: number, price: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/roster/${rosterId}/price`, {
    method: "PATCH",
    body: JSON.stringify({ price }),
  });
}

// ─── Player Values ───────────────────────────────────────────────────────────

export interface UploadValuesResponse {
  success: boolean;
  matched: number;
  unmatched: number;
  total: number;
  unmatchedNames: string[];
}

export async function uploadPlayerValues(leagueId: number, file: File): Promise<UploadValuesResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetchWithAuth(`${API_BASE}/commissioner/${leagueId}/keeper-prep/upload-values`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Upload failed (HTTP ${res.status})`);
  }

  return res.json();
}

export interface PlayerValueItem {
  id: number;
  playerName: string;
  value: number;
  position: string | null;
  playerId: number | null;
  player: { id: number; name: string; posPrimary: string; mlbTeam: string | null } | null;
}

export async function getPlayerValues(leagueId: number): Promise<{ values: PlayerValueItem[] }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/values`);
}

export async function clearPlayerValues(leagueId: number): Promise<{ success: boolean; cleared: number }> {
  return fetchJsonApi(`${API_BASE}/commissioner/${leagueId}/keeper-prep/values`, {
    method: "DELETE",
  });
}

// --- AI Keeper Recommendations ---

export interface KeeperRecommendation {
  rank: number;
  playerName: string;
  keeperCost: number;
  reasoning: string;
}

export interface KeeperRecommendResult {
  recommendations: KeeperRecommendation[];
  strategy: string;
}

export async function getKeeperAiRecommendations(leagueId: number, teamId: number): Promise<KeeperRecommendResult> {
  return fetchJsonApi<KeeperRecommendResult>(`${API_BASE}/commissioner/${leagueId}/keeper-prep/ai-recommend?teamId=${teamId}`);
}
