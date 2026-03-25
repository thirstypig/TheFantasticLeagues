import { API_BASE, fetchJsonApi } from "../../api/base";

export interface DraftPickEntry {
  pickNum: number;
  round: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  isAutoPick: boolean;
  timestamp: number;
}

export interface DraftState {
  leagueId: number;
  status: "waiting" | "active" | "paused" | "completed";
  config: {
    totalRounds: number;
    secondsPerPick: number;
    orderType: "SNAKE" | "LINEAR";
    teamOrder: number[];
  };
  pickOrder: number[];
  currentPickIndex: number;
  picks: DraftPickEntry[];
  draftedPlayerIds: number[];
  autoPickTeams: number[];
  timerExpiresAt: number | null;
}

export async function getDraftState(leagueId: number): Promise<DraftState> {
  return fetchJsonApi<DraftState>(`${API_BASE}/draft/state?leagueId=${leagueId}`);
}

export async function initDraft(data: {
  leagueId: number;
  teamOrder: number[];
  totalRounds?: number;
  secondsPerPick?: number;
  orderType?: "SNAKE" | "LINEAR";
}): Promise<{ success: boolean; totalPicks: number }> {
  return fetchJsonApi(`${API_BASE}/draft/init`, { method: "POST", body: JSON.stringify(data) });
}

export async function startDraft(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/draft/start`, { method: "POST", body: JSON.stringify({ leagueId }) });
}

export async function makePick(leagueId: number, teamId: number, playerId: number): Promise<{ success: boolean; pick: DraftPickEntry }> {
  return fetchJsonApi(`${API_BASE}/draft/pick`, { method: "POST", body: JSON.stringify({ leagueId, teamId, playerId }) });
}

export async function pauseDraft(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/draft/pause`, { method: "POST", body: JSON.stringify({ leagueId }) });
}

export async function resumeDraft(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/draft/resume`, { method: "POST", body: JSON.stringify({ leagueId }) });
}

export async function undoPick(leagueId: number): Promise<{ success: boolean; undone: DraftPickEntry }> {
  return fetchJsonApi(`${API_BASE}/draft/undo`, { method: "POST", body: JSON.stringify({ leagueId }) });
}

export async function skipPick(leagueId: number): Promise<{ success: boolean; pick: DraftPickEntry }> {
  return fetchJsonApi(`${API_BASE}/draft/skip`, { method: "POST", body: JSON.stringify({ leagueId }) });
}

export async function toggleAutoPick(leagueId: number, teamId: number, enabled: boolean): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/draft/auto-pick`, { method: "POST", body: JSON.stringify({ leagueId, teamId, enabled }) });
}

export async function completeDraft(leagueId: number): Promise<{ success: boolean; picks: number }> {
  return fetchJsonApi(`${API_BASE}/draft/complete`, { method: "POST", body: JSON.stringify({ leagueId }) });
}

export async function resetDraft(leagueId: number): Promise<{ success: boolean }> {
  return fetchJsonApi(`${API_BASE}/draft/reset`, { method: "POST", body: JSON.stringify({ leagueId }) });
}
