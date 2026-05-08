/**
 * Client wrappers for /api/wire-list/* — two-list waiver model.
 * Server contract: shared/api/wireList.ts; routes: server/src/features/wire-list/.
 */
import { fetchJsonApi, API_BASE } from "../../api/base";
import type {
  WaiverPeriodStatus,
  WaiverDropMode,
  WaiverAddOutcome,
  WaiverDropStatus,
} from "../../../../shared/api/wireList";

// Re-export shared types so existing callers continue to import from here.
export type { WaiverPeriodStatus, WaiverDropMode, WaiverAddOutcome, WaiverDropStatus };

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

export async function listPeriods(leagueId: number): Promise<{ periods: WaiverPeriod[] }> {
  return fetchJsonApi<{ periods: WaiverPeriod[] }>(
    `${API_BASE}/wire-list/leagues/${leagueId}/periods`,
  );
}

// Named `createWirePeriod` not `createPeriod` to avoid colliding with the
// stat-period creator in `features/seasons/api.ts` (both re-exported from
// `client/src/api/index.ts`).
export async function createWirePeriod(leagueId: number, deadlineAt: string): Promise<WaiverPeriod> {
  return fetchJsonApi<WaiverPeriod>(
    `${API_BASE}/wire-list/leagues/${leagueId}/periods`,
    { method: "POST", body: JSON.stringify({ deadlineAt }) },
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

/**
 * Atomic reorder of all Add or Drop entries for a (period, team, kind).
 * Replaces the legacy 3-call swap dance (todo #159). Server rewrites
 * priorities in a single transaction (negative temps then final values).
 *
 * `orderedIds` MUST list every entry for the team/period/kind exactly
 * once — index 0 becomes priority 1, etc.
 */
export async function reorderEntries(
  periodId: number,
  kind: "ADD" | "DROP",
  teamId: number,
  orderedIds: number[],
): Promise<{ entries: AddEntry[] | DropEntry[] }> {
  return fetchJsonApi<{ entries: AddEntry[] | DropEntry[] }>(
    `${API_BASE}/wire-list/periods/${periodId}/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ kind, teamId, orderedIds }),
    },
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

export async function createAddEntry(
  periodId: number,
  body: { teamId: number; playerId: number },
): Promise<AddEntry> {
  return fetchJsonApi<AddEntry>(`${API_BASE}/wire-list/periods/${periodId}/adds`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createDropEntry(
  periodId: number,
  body: { teamId: number; playerId: number; dropMode?: WaiverDropMode },
): Promise<DropEntry> {
  return fetchJsonApi<DropEntry>(`${API_BASE}/wire-list/periods/${periodId}/drops`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Processor (commissioner) ────────────────────────────────────────

export interface PeriodResults {
  period: WaiverPeriod;
  byTeam: Array<{ teamId: number; adds: AddEntry[]; drops: DropEntry[] }>;
}

export async function getPeriodResults(periodId: number): Promise<PeriodResults> {
  return fetchJsonApi<PeriodResults>(`${API_BASE}/wire-list/periods/${periodId}/results`);
}

export async function lockPeriod(periodId: number): Promise<WaiverPeriod> {
  return fetchJsonApi<WaiverPeriod>(`${API_BASE}/wire-list/periods/${periodId}/lock`, {
    method: "POST",
  });
}

export async function finalizePeriod(periodId: number): Promise<{
  period: WaiverPeriod;
  addsApplied: number;
  dropsConsumed: number;
  dropsUnused: number;
}> {
  return fetchJsonApi(`${API_BASE}/wire-list/periods/${periodId}/finalize`, {
    method: "POST",
  });
}

export async function succeedAdd(addId: number): Promise<AddEntry> {
  return fetchJsonApi<AddEntry>(`${API_BASE}/wire-list/adds/${addId}/succeed`, {
    method: "POST",
  });
}

export async function failAdd(addId: number, reason?: string): Promise<AddEntry> {
  return fetchJsonApi<AddEntry>(`${API_BASE}/wire-list/adds/${addId}/fail`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function skipAdd(addId: number, reason?: string): Promise<AddEntry> {
  return fetchJsonApi<AddEntry>(`${API_BASE}/wire-list/adds/${addId}/skip`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function revertAdd(addId: number): Promise<AddEntry> {
  return fetchJsonApi<AddEntry>(`${API_BASE}/wire-list/adds/${addId}/revert`, {
    method: "POST",
  });
}
