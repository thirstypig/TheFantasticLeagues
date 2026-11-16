import { API_BASE, fetchJsonApi, parseJsonResponse } from "../../api/base";
import {
  MeetingChoicesResponseSchema,
  MeetingSessionResponseSchema,
  type MeetingChoicesResponse,
  type MeetingPlayer,
  type MeetingSessionResponse,
  type OpenBody,
  type OrderBody,
  type PassBody,
  type SubmitBody,
} from "@shared/api/meeting";

const BASE = `${API_BASE}/meeting`;

async function request(path: string, init?: RequestInit): Promise<MeetingSessionResponse> {
  const raw = await fetchJsonApi<unknown>(`${BASE}${path}`, init);
  return parseJsonResponse(MeetingSessionResponseSchema, raw, `meeting${path}`);
}

function post(path: string, body?: unknown): Promise<MeetingSessionResponse> {
  return request(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export const getCurrentMeeting = (leagueId: number) => request(`/leagues/${leagueId}/current`);
export const openMeeting = (leagueId: number, body: OpenBody) => post(`/leagues/${leagueId}/open`, body);

export const setOrder = (id: number, body: OrderBody) => post(`/sessions/${id}/order`, body);
export const startMeeting = (id: number, version: number) => post(`/sessions/${id}/start`, { version });
export const pauseMeeting = (id: number, version: number) => post(`/sessions/${id}/pause`, { version });
export const resumeMeeting = (id: number, version: number) => post(`/sessions/${id}/resume`, { version });
export const addTime = (id: number, version: number) => post(`/sessions/${id}/add-time`, { version });
export const skipTurn = (id: number, version: number) => post(`/sessions/${id}/skip`, { version });
export const endMeeting = (id: number, version: number) => post(`/sessions/${id}/end`, { version });
export const submitMove = (id: number, body: SubmitBody) => post(`/sessions/${id}/submit`, body);
export const passTurn = (id: number, body: PassBody) => post(`/sessions/${id}/pass`, body);
export const markHandedOff = (id: number) => post(`/sessions/${id}/handed-off`);

export async function getChoices(id: number, teamId: number): Promise<MeetingChoicesResponse> {
  const raw = await fetchJsonApi<unknown>(`${BASE}/sessions/${id}/choices?teamId=${teamId}`);
  return parseJsonResponse(MeetingChoicesResponseSchema, raw, "meeting/choices");
}

interface FreeAgentRow {
  id: number;
  mlb_id?: string | null;
  player_name: string;
  positions?: string | null;
  mlb_team?: string | null;
}

export async function searchFreeAgents(leagueId: number, q: string): Promise<MeetingPlayer[]> {
  const text = q.trim();
  if (!text) return [];
  const params = new URLSearchParams({ leagueId: String(leagueId), freeAgentsOnly: "true", q: text, take: "20" });
  const res = await fetchJsonApi<{ stats: FreeAgentRow[] }>(`${API_BASE}/player-season-stats?${params}`);
  const seen = new Set<number>();
  const out: MeetingPlayer[] = [];
  for (const r of res.stats ?? []) {
    if (seen.has(r.id)) continue; // two-way players come back as two rows
    seen.add(r.id);
    const mlbId = Number(r.mlb_id);
    out.push({
      playerId: r.id,
      name: r.player_name,
      pos: r.positions ?? "",
      mlbTeam: r.mlb_team || null,
      mlbId: Number.isFinite(mlbId) && r.mlb_id ? mlbId : null,
    });
  }
  return out;
}

/** Team ids worst first (lowest season points), ties by team name. */
export async function getSeasonOrder(leagueId: number): Promise<number[]> {
  const res = await fetchJsonApi<{
    rows: { teamId: number; teamName: string; teamCode: string; periodPoints: number[]; totalPoints: number }[];
  }>(`${API_BASE}/season?leagueId=${leagueId}`); // standingsRouter is mounted at /api
  return [...(res.rows ?? [])]
    .sort((a, b) => a.totalPoints - b.totalPoints || a.teamName.localeCompare(b.teamName))
    .map((r) => r.teamId);
}
