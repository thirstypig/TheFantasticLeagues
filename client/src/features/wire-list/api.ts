/**
 * Client wrappers for /api/wire-list/* — two-list waiver model.
 * Server contract: shared/api/wireList.ts; routes: server/src/features/wire-list/.
 */
import { fetchJsonApi, API_BASE } from "../../api/base";

// ─── Wire types (mirror Prisma + shared schemas) ─────────────────────

export type WaiverPeriodStatus = "PENDING" | "LOCKED" | "PROCESSED" | "CANCELLED";
export type WaiverDropMode = "RELEASE" | "IL_STASH";
export type WaiverAddOutcome = "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
export type WaiverDropStatus = "PENDING" | "CONSUMED" | "UNUSED";

export interface WaiverPeriod {
  id: number;
  leagueId: number;
  deadlineAt: string;
  lockedAt: string | null;
  processedAt: string | null;
  status: WaiverPeriodStatus;
  createdAt: string;
}

export interface AddEntryPlayer {
  id: number;
  name: string;
  posPrimary: string | null;
  mlbTeam: string | null;
  mlbId: number | null;
}

export interface AddEntry {
  id: number;
  periodId: number;
  teamId: number;
  playerId: number;
  priority: number;
  outcome: WaiverAddOutcome;
  consumedDropEntryId: number | null;
  reason: string | null;
  processedAt: string | null;
  createdAt: string;
  player?: AddEntryPlayer;
}

export interface DropEntry {
  id: number;
  periodId: number;
  teamId: number;
  playerId: number;
  priority: number;
  dropMode: WaiverDropMode;
  status: WaiverDropStatus;
  processedAt: string | null;
  createdAt: string;
  player?: AddEntryPlayer;
}

// ─── API calls ───────────────────────────────────────────────────────

export async function getActivePeriod(leagueId: number): Promise<{ period: WaiverPeriod | null }> {
  return fetchJsonApi<{ period: WaiverPeriod | null }>(
    `${API_BASE}/wire-list/periods/active?leagueId=${leagueId}`,
  );
}

export async function getAddEntries(periodId: number, teamId: number): Promise<{ entries: AddEntry[] }> {
  return fetchJsonApi<{ entries: AddEntry[] }>(
    `${API_BASE}/wire-list/periods/${periodId}/adds?teamId=${teamId}`,
  );
}

export async function getDropEntries(periodId: number, teamId: number): Promise<{ entries: DropEntry[] }> {
  return fetchJsonApi<{ entries: DropEntry[] }>(
    `${API_BASE}/wire-list/periods/${periodId}/drops?teamId=${teamId}`,
  );
}

export async function updateAddPriority(id: number, priority: number): Promise<AddEntry> {
  return fetchJsonApi<AddEntry>(`${API_BASE}/wire-list/adds/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });
}

export async function updateDropEntry(
  id: number,
  patch: { priority?: number; dropMode?: WaiverDropMode },
): Promise<DropEntry> {
  return fetchJsonApi<DropEntry>(`${API_BASE}/wire-list/drops/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAddEntry(id: number): Promise<{ success: boolean }> {
  return fetchJsonApi<{ success: boolean }>(`${API_BASE}/wire-list/adds/${id}`, {
    method: "DELETE",
  });
}

export async function deleteDropEntry(id: number): Promise<{ success: boolean }> {
  return fetchJsonApi<{ success: boolean }>(`${API_BASE}/wire-list/drops/${id}`, {
    method: "DELETE",
  });
}
