
import { fetchJsonApi, API_BASE } from '../../api/base';

export interface TransactionEvent {
  id: number;
  leagueId: number;
  teamId: number | null;
  playerId: number | null;
  type: string; // ADD, DROP, TRADE, COMMISSIONER
  amount: number | null;
  relatedTransactionId: number | null;
  submittedAt: string;
  processedAt: string | null;
  status: string; // PENDING, APPROVED, REJECTED
  team?: { name: string };
  player?: { name: string };
  
  // Legacy / Raw fields
  effDate?: string;
  effDateRaw?: string;
  ogbaTeamName?: string;
  playerAliasRaw?: string;
  transactionRaw?: string;
}

export async function getTransactions(params?: { leagueId?: number; teamId?: number; skip?: number; take?: number }): Promise<{ transactions: TransactionEvent[], total: number }> {
    const q = new URLSearchParams();
    if (params?.leagueId) q.set('leagueId', String(params.leagueId));
    if (params?.teamId) q.set('teamId', String(params.teamId));
    if (params?.skip) q.set('skip', String(params.skip));
    if (params?.take) q.set('take', String(params.take));

    return fetchJsonApi(`${API_BASE}/transactions?${q.toString()}`);
}

/**
 * Yahoo-style auto-resolve reassignment (PR1 of plan #166). When the league
 * has `transactions.auto_resolve_slots` enabled, the server may move other
 * roster rows to fit the new player legally. Each move is echoed here so
 * the client can surface a toast like "Also moved: Trea Turner 2B → SS".
 */
export interface AppliedReassignment {
    rosterId: number;
    playerId: number;
    playerName: string;
    oldSlot: string;
    newSlot: string;
}

export interface IlStashParams {
    leagueId: number;
    teamId: number;
    stashPlayerId: number;
    addPlayerId?: number;
    addMlbId?: number;
    effectiveDate?: string;
    reason?: string;
}

export async function ilStash(params: IlStashParams): Promise<{ success: boolean; stashPlayerId: number; addPlayerId: number; appliedReassignments?: AppliedReassignment[] }> {
    return fetchJsonApi(`${API_BASE}/transactions/il-stash`, {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export interface IlActivateParams {
    leagueId: number;
    teamId: number;
    activatePlayerId: number;
    dropPlayerId: number;
    effectiveDate?: string;
    reason?: string;
}

export async function ilActivate(params: IlActivateParams): Promise<{ success: boolean; activatePlayerId: number; dropPlayerId: number; appliedReassignments?: AppliedReassignment[] }> {
    return fetchJsonApi(`${API_BASE}/transactions/il-activate`, {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/**
 * Format a list of auto-resolve reassignments as a single-line toast.
 * Returns null when there are no reassignments (caller suppresses toast).
 *
 * Format: "{primary action}. Also moved: {Player A} {oldSlot} → {newSlot}, ..."
 * Spec: plan #166, AddDropPanel/PlaceOnIlPanel/ActivateFromIlPanel toast wiring.
 */
export function formatReassignmentsToast(
    reassignments: AppliedReassignment[] | undefined,
    primaryActionLabel: string,
): string | null {
    if (!reassignments || reassignments.length === 0) return null;
    const moves = reassignments
        .map((r) => `${r.playerName} ${r.oldSlot} → ${r.newSlot}`)
        .join(", ");
    return `${primaryActionLabel} Also moved: ${moves}.`;
}
