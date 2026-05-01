
import { fetchJsonApi, API_BASE } from '../../api/base';
import type {
    AppliedReassignment as SharedAppliedReassignment,
    ClaimRequest,
    ClaimResponse,
    IlStashRequest,
    IlStashResponse,
    IlActivateRequest,
    IlActivateResponse,
} from '@shared/api/rosterMoves';

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
 * Yahoo-style auto-resolve reassignment. The server runs a bipartite matcher
 * on every claim / IL stash / IL activate and may move other roster rows to
 * fit the new player legally. Each move is echoed here so the client can
 * surface a toast like "Also moved: Trea Turner 2B → SS".
 *
 * Sourced from `@shared/api/rosterMoves` to keep the wire shape in sync.
 */
export type AppliedReassignment = SharedAppliedReassignment;

// Request param types — re-exported from shared so component-side imports
// don't have to dual-import. Wire shape is enforced server-side via Zod.
export type ClaimParams = ClaimRequest;
export type IlStashParams = IlStashRequest;
export type IlActivateParams = IlActivateRequest;

export async function ilStash(params: IlStashParams): Promise<IlStashResponse> {
    return fetchJsonApi(`${API_BASE}/transactions/il-stash`, {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export async function ilActivate(params: IlActivateParams): Promise<IlActivateResponse> {
    return fetchJsonApi(`${API_BASE}/transactions/il-activate`, {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

// Re-export the response types so components can import the canonical shapes
// without dual-importing from `@shared`.
export type { ClaimResponse, IlStashResponse, IlActivateResponse };

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
