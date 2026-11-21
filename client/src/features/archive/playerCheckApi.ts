// Archive player check: the names on archived rosters that still need a person
// to say which MLB player they are. Wire contract: @shared/api/archivePlayerCheck.
import {
  PlayerCheckItemResponseSchema, PlayerCheckResponseSchema, PlayerCheckSearchResponseSchema,
  type PlayerCheckDecisionBody, type PlayerCheckItem, type PlayerCheckResponse, type PlayerCheckSearchResponse,
} from "@shared/api/archivePlayerCheck";
import { API_BASE, fetchJsonApi, parseJsonResponse } from "../../api/base";

const BASE = `${API_BASE}/archive/player-check`;

export async function getPlayerCheck(): Promise<PlayerCheckResponse> {
  return parseJsonResponse(PlayerCheckResponseSchema, await fetchJsonApi(BASE), "player-check");
}

export async function decidePlayer(id: number, body: PlayerCheckDecisionBody): Promise<PlayerCheckItem> {
  const res = await fetchJsonApi(`${BASE}/${id}/decision`, { method: "PUT", body: JSON.stringify(body) });
  return parseJsonResponse(PlayerCheckItemResponseSchema, res, "player-check decide").item;
}

export async function undoPlayerDecision(id: number): Promise<PlayerCheckItem> {
  const res = await fetchJsonApi(`${BASE}/${id}/decision`, { method: "DELETE" });
  return parseJsonResponse(PlayerCheckItemResponseSchema, res, "player-check undo").item;
}

export async function searchPlayers(id: number, query: string): Promise<PlayerCheckSearchResponse> {
  const res = await fetchJsonApi(`${BASE}/${id}/search?q=${encodeURIComponent(query)}`);
  return parseJsonResponse(PlayerCheckSearchResponseSchema, res, "player-check search");
}
