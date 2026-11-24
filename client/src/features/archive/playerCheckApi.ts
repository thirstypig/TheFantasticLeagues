// Archive player check: the names on archived rosters that still need a person
// to say which MLB player they are. Wire contract: @shared/api/archivePlayerCheck.
import {
  AuditAccessListResponseSchema, AuditAccessMeResponseSchema,
  PlayerCheckItemResponseSchema, PlayerCheckResponseSchema, PlayerCheckSearchResponseSchema,
  type ArchiveAuditAccess, type AuditAccessMeResponse, type AuditAccessMember,
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

const ACCESS = `${API_BASE}/archive/audit-access`;

/** May the viewer help on the player check? Any member may ask. */
export async function getMyAuditAccess(): Promise<AuditAccessMeResponse> {
  return parseJsonResponse(AuditAccessMeResponseSchema, await fetchJsonApi(`${ACCESS}/me`), "audit-access me");
}

/** Every franchise member and his player-check access (site admin). */
export async function listAuditAccess(): Promise<AuditAccessMember[]> {
  return parseJsonResponse(AuditAccessListResponseSchema, await fetchJsonApi(ACCESS), "audit-access list").members;
}

export async function setAuditAccess(membershipId: number, access: ArchiveAuditAccess): Promise<void> {
  await fetchJsonApi(`${ACCESS}/${membershipId}`, { method: "PUT", body: JSON.stringify({ access }) });
}
