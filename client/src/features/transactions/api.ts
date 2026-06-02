
import { fetchJsonApi, API_BASE, parseJsonResponse } from '../../api/base';
import {
    ClaimRequestSchema,
    IlStashRequestSchema,
    IlActivateRequestSchema,
    SyncIlStatusBodySchema,
    SyncIlStatusResponseSchema,
} from '@shared/api/rosterMoves';
import type {
    ClaimRequest as SharedClaimRequest,
    ClaimResponse,
    IlStashRequest as SharedIlStashRequest,
    IlStashResponse,
    IlActivateRequest as SharedIlActivateRequest,
    IlActivateResponse,
    AppliedReassignment as SharedAppliedReassignment,
} from '@shared/api/rosterMoves';

// Re-export the shared envelope types for callers who want the source-of-truth
// shapes. The `*Params` interfaces below remain for backwards compatibility
// with existing imports — they're now structurally identical to the shared
// request types.
export type {
    SharedClaimRequest as ClaimRequest,
    ClaimResponse,
    SharedIlStashRequest as IlStashRequest,
    IlStashResponse,
    SharedIlActivateRequest as IlActivateRequest,
    IlActivateResponse,
};

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

  // Server-augmented wire fields (todo #121: previously declared via local
  // `as TransactionEvent & {…}` intersections in consumer pages, now hoisted
  // here so the canonical type matches the wire). The server emits these on
  // every row from `GET /api/transactions`:
  /** Effective date in ISO format — `effDateRaw` parsed into a date string. */
  effectiveDate?: string;
  /** Server-side row creation timestamp (ISO 8601). */
  createdAt?: string;
  /** Discriminated transaction kind: ADD / DROP / TRADE / IL_STASH / IL_ACTIVATE / etc. */
  transactionType?: string;
}

export async function getTransactions(params?: { leagueId?: number; teamId?: number; skip?: number; take?: number }): Promise<{ transactions: TransactionEvent[], total: number }> {
    const q = new URLSearchParams();
    if (params?.leagueId) q.set('leagueId', String(params.leagueId));
    if (params?.teamId) q.set('teamId', String(params.teamId));
    if (params?.skip) q.set('skip', String(params.skip));
    if (params?.take) q.set('take', String(params.take));

    return fetchJsonApi(`${API_BASE}/transactions?${q.toString()}`);
}

export interface RosterMovePreviewResult {
    ok: boolean;
    message?: string;
    error?: string;
    code?: string;
    appliedReassignments?: Array<{
        rosterId: number;
        oldSlot: string | null;
        newSlot: string;
    }>;
}

export async function previewClaim(params: SharedClaimRequest): Promise<RosterMovePreviewResult> {
    // Validate the request body at the client boundary against the shared
    // schema (todo #123). Throws ZodError synchronously if a caller passes a
    // body shape the server's `validateBody(ClaimRequestSchema)` would reject —
    // surfaces drift in dev/test before the fetch round-trip.
    const body = ClaimRequestSchema.parse(params);
    return fetchJsonApi<RosterMovePreviewResult>(`${API_BASE}/transactions/claim/preview`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function claim(params: SharedClaimRequest): Promise<ClaimResponse> {
    const body = ClaimRequestSchema.parse(params);
    return fetchJsonApi<ClaimResponse>(`${API_BASE}/transactions/claim`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

/**
 * Yahoo-style auto-resolve reassignment. Re-exported from
 * `@shared/api/rosterMoves` so client and server share one definition.
 *
 * The server runs a bipartite matcher on every claim / IL stash / IL
 * activate and may move other roster rows to fit the new player legally.
 * Each move is echoed here so the client can surface a toast like
 * "Also moved: Trea Turner 2B → SS".
 */
export type AppliedReassignment = SharedAppliedReassignment;

export interface IlStashParams {
    leagueId: number;
    teamId: number;
    stashPlayerId: number;
    /** Pairing add — optional in v3 hub stash-only mode. When omitted, the
     *  freed active slot stays empty and the server's matcher reshuffles the
     *  rest of the active roster from BN. */
    addPlayerId?: number;
    addMlbId?: number;
    effectiveDate?: string;
    reason?: string;
}

export async function ilStash(params: IlStashParams): Promise<{ success: boolean; stashPlayerId: number; addPlayerId: number | null; stashOnly?: boolean; appliedReassignments?: AppliedReassignment[] }> {
    const body = IlStashRequestSchema.parse(params);
    return fetchJsonApi(`${API_BASE}/transactions/il-stash`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function previewIlStash(params: IlStashParams): Promise<RosterMovePreviewResult> {
    const body = IlStashRequestSchema.parse(params);
    return fetchJsonApi<RosterMovePreviewResult>(`${API_BASE}/transactions/il-stash/preview`, {
        method: 'POST',
        body: JSON.stringify(body),
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
    const body = IlActivateRequestSchema.parse(params);
    return fetchJsonApi(`${API_BASE}/transactions/il-activate`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function previewIlActivate(params: IlActivateParams): Promise<RosterMovePreviewResult> {
    const body = IlActivateRequestSchema.parse(params);
    return fetchJsonApi<RosterMovePreviewResult>(`${API_BASE}/transactions/il-activate/preview`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export interface SyncIlStatusResult {
    playerId: number;
    mlbId: number | null;
    /** Raw MLB statsapi status string ("Injured 10-Day", "Active", …) or null
     *  when the player isn't on their MLB team's 40-man. */
    mlbStatus: string | null;
    fetchedAt: string;
}

/**
 * Force a single-player MLB status refetch — powers the v3 hub's
 * ghost-IL "Resync" chip (IL scenario direction-lock #3). Read-only,
 * does NOT mutate roster state. Returns 503 with `MLB_FEED_UNAVAILABLE`
 * if the statsapi feed is down; the UI surfaces this and lets the user
 * retry later.
 */
export async function syncIlStatus(params: {
    leagueId: number;
    teamId: number;
    playerId: number;
}): Promise<SyncIlStatusResult> {
    const body = SyncIlStatusBodySchema.parse(params);
    const raw = await fetchJsonApi<unknown>(`${API_BASE}/transactions/sync-il-status`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    // Pilot of `parseJsonResponse` per todo #123 acceptance: at least one
    // endpoint response is `safeParse`d on the client. Drift is logged via
    // console.warn rather than thrown — schema is advisory at the client
    // boundary, not authoritative.
    return parseJsonResponse(SyncIlStatusResponseSchema, raw, 'syncIlStatus');
}

