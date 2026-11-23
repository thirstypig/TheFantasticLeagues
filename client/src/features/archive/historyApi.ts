// The rebuilt past-seasons archive. Wire contract: @shared/api/archiveSeason.
import {
  ArchiveSeasonListResponseSchema, ArchiveSeasonResponseSchema,
  type ArchiveSeasonListResponse, type ArchiveSeasonResponse,
} from "@shared/api/archiveSeason";
import { API_BASE, fetchJsonApi, parseJsonResponse } from "../../api/base";

export async function getArchiveHistory(): Promise<ArchiveSeasonListResponse> {
  return parseJsonResponse(ArchiveSeasonListResponseSchema, await fetchJsonApi(`${API_BASE}/archive/history`), "archive history");
}

export async function getArchiveSeason(year: number): Promise<ArchiveSeasonResponse> {
  return parseJsonResponse(ArchiveSeasonResponseSchema, await fetchJsonApi(`${API_BASE}/archive/history/${year}`), "archive season");
}
