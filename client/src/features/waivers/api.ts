import { fetchJsonApi, API_BASE } from "../../api/base";

// --- Types ---

export interface WaiverClaim {
  id: number;
  teamId: number;
  playerId: number;
  dropPlayerId?: number | null;
  bidAmount: number;
  priority: number;
  status: "PENDING" | "SUCCESS" | "FAILED_OUTBID" | "FAILED_INVALID";
  processedAt?: string | null;
  player?: { id: number; name: string; posPrimary?: string };
  dropPlayer?: { id: number; name: string; posPrimary?: string } | null;
}

export interface WaiverProcessResult {
  success: boolean;
  logs: string[];
}

// --- API Functions ---

export async function getWaiverClaims(teamId?: number): Promise<{ claims: WaiverClaim[] }> {
  const params = teamId ? `?teamId=${teamId}` : "";
  return fetchJsonApi<{ claims: WaiverClaim[] }>(`${API_BASE}/waivers${params}`);
}

export async function submitWaiverClaim(data: {
  teamId: number;
  playerId: number;
  dropPlayerId?: number;
  bidAmount: number;
  priority?: number;
}): Promise<WaiverClaim> {
  return fetchJsonApi<WaiverClaim>(`${API_BASE}/waivers`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelWaiverClaim(id: number): Promise<{ success: boolean }> {
  return fetchJsonApi<{ success: boolean }>(`${API_BASE}/waivers/${id}`, {
    method: "DELETE",
  });
}

export async function processWaiverClaims(leagueId: number): Promise<WaiverProcessResult> {
  return fetchJsonApi<WaiverProcessResult>(`${API_BASE}/waivers/process/${leagueId}`, {
    method: "POST",
  });
}
