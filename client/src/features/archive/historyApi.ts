// The rebuilt past-seasons archive. Wire contract: @shared/api/archiveSeason.
import {
  ArchiveSeasonListResponseSchema, ArchiveSeasonResponseSchema,
  type ArchiveSeasonListResponse, type ArchiveSeasonResponse,
} from "@shared/api/archiveSeason";
import { API_BASE, fetchJsonApi, fetchWithAuth, parseJsonResponse } from "../../api/base";

export async function getArchiveHistory(): Promise<ArchiveSeasonListResponse> {
  return parseJsonResponse(ArchiveSeasonListResponseSchema, await fetchJsonApi(`${API_BASE}/archive/history`), "archive history");
}

export async function getArchiveSeason(year: number): Promise<ArchiveSeasonResponse> {
  return parseJsonResponse(ArchiveSeasonResponseSchema, await fetchJsonApi(`${API_BASE}/archive/history/${year}`), "archive season");
}

/**
 * Save the commissioner's original workbook for a season. Fetched with the
 * sign-in token (a plain link wouldn't send it), then handed to the browser
 * as a file named the way the commissioner named it.
 */
export async function downloadWorkbook(year: number, fileName: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/archive/history/${year}/workbook`);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || "Couldn’t download that workbook. Try again.");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
