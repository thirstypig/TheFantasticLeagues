/**
 * Contract: commissioner bulk-ops wire schemas
 *
 * Source-of-truth Zod schemas for the commissioner bulk-operation endpoints
 * shipped in `feat/commissioner-bulk-ops`. Both client and server import from
 * here so the wire format stays synchronized.
 *
 * Endpoints:
 *   - GET  /api/commissioner/:leagueId/il-audit
 *   - POST /api/commissioner/:leagueId/bulk-il-stash
 *   - POST /api/commissioner/:leagueId/cleanup-dropped
 *   - GET  /api/commissioner/:leagueId/balances
 *   - GET  /api/commissioner/:leagueId/ledger?type=meeting_overtime
 *   - POST /api/commissioner/:leagueId/ledger/:entryId/void
 */
import { z } from "zod";

// ── IL audit ─────────────────────────────────────────────────────────

/**
 * One row of the league-wide IL audit: a player on a team's active roster
 * (NOT on an IL slot) whose MLB status begins with "Injured" and is therefore
 * eligible for an IL stash.
 */
export const IlAuditRowSchema = z.object({
  teamId: z.number().int().positive(),
  teamName: z.string(),
  teamCode: z.string().nullable(),
  playerId: z.number().int().positive(),
  playerName: z.string(),
  mlbId: z.number().int().nullable(),
  mlbStatus: z.string(),
  assignedPosition: z.string().nullable(),
});
export type IlAuditRow = z.infer<typeof IlAuditRowSchema>;

export const IlAuditResponseSchema = z.object({
  rows: z.array(IlAuditRowSchema),
  totalRows: z.number().int().nonnegative(),
  totalTeams: z.number().int().nonnegative(),
  /** ISO timestamp recording when the audit fanned out to MLB feeds. */
  fetchedAt: z.string(),
});
export type IlAuditResponse = z.infer<typeof IlAuditResponseSchema>;

// ── Bulk IL stash ────────────────────────────────────────────────────

export const BulkIlStashEntrySchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
});
export type BulkIlStashEntry = z.infer<typeof BulkIlStashEntrySchema>;

export const BulkIlStashRequestSchema = z.object({
  entries: z.array(BulkIlStashEntrySchema).min(1).max(200),
});
export type BulkIlStashRequest = z.infer<typeof BulkIlStashRequestSchema>;

export const BulkIlStashSucceededSchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  /** "stashed" if the entry was a real mutation; "noop" when the player was
   *  already on an IL slot (idempotency case). */
  outcome: z.enum(["stashed", "noop"]),
});
export type BulkIlStashSucceeded = z.infer<typeof BulkIlStashSucceededSchema>;

export const BulkIlStashFailedSchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  reason: z.string(),
  code: z.string().optional(),
});
export type BulkIlStashFailed = z.infer<typeof BulkIlStashFailedSchema>;

export const BulkIlStashResponseSchema = z.object({
  succeeded: z.array(BulkIlStashSucceededSchema),
  failed: z.array(BulkIlStashFailedSchema),
});
export type BulkIlStashResponse = z.infer<typeof BulkIlStashResponseSchema>;

// ── Cleanup dropped roster rows ──────────────────────────────────────

export const CleanupDroppedRequestSchema = z.object({
  /** Rows whose `releasedAt` is older than this many days are eligible.
   *  Bounded to a sensible range; default in the UI is 30. */
  olderThanDays: z.number().int().min(1).max(3650),
});
export type CleanupDroppedRequest = z.infer<typeof CleanupDroppedRequestSchema>;

export const CleanupDroppedResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
  /** ISO timestamp — the cutoff used; rows newer than this are kept. Null
   *  when nothing was deleted (caller still gets the cutoff for clarity). */
  cutoff: z.string(),
});
export type CleanupDroppedResponse = z.infer<typeof CleanupDroppedResponseSchema>;

// ── Finance balances (todo #311) ─────────────────────────────────────

/**
 * One team's net FinanceLedger balance.
 *
 * `balance` is the sum of EVERY ledger row for the team — voided rows
 * included. The ledger is append-only: a correction stamps `voidedAt` on the
 * original AND appends a negated contra-entry, so filtering voided rows
 * removes the same money twice. See `server/src/lib/financeLedger.ts`.
 *
 * Whole dollars, matching `FinanceLedger.amount` (Int). Negative = credit.
 */
export const TeamBalanceRowSchema = z.object({
  teamId: z.number().int().positive(),
  teamName: z.string(),
  balance: z.number().int(),
});
export type TeamBalanceRow = z.infer<typeof TeamBalanceRowSchema>;

export const LeagueBalancesResponseSchema = z.object({
  balances: z.array(TeamBalanceRowSchema),
});
export type LeagueBalancesResponse = z.infer<typeof LeagueBalancesResponseSchema>;

// ── Ledger entries + void (todo #315) ────────────────────────────────

/**
 * Ledger types a commissioner can void from Commissioner → Finances → Ledger.
 * Meeting fees only for now; IL fees keep their reconcile path.
 */
export const VOIDABLE_LEDGER_TYPES = ["meeting_overtime"] as const;
export type VoidableLedgerType = (typeof VOIDABLE_LEDGER_TYPES)[number];

/**
 * One original charge (never a reversal row) with its void state. A voided
 * row still counts toward the balance; its reversal cancels it (todo #311).
 */
export const LedgerEntryRowSchema = z.object({
  id: z.number().int().positive(),
  teamId: z.number().int().positive(),
  teamName: z.string(),
  periodId: z.number().int().positive().nullable(),
  periodName: z.string().nullable(),
  type: z.string(),
  amount: z.number().int(),
  reason: z.string().nullable(),
  /** ISO timestamp the charge was written. */
  ts: z.string(),
  /** ISO timestamp of the void, or null while the charge stands. */
  voidedAt: z.string().nullable(),
});
export type LedgerEntryRow = z.infer<typeof LedgerEntryRowSchema>;

export const LedgerEntriesResponseSchema = z.object({
  entries: z.array(LedgerEntryRowSchema),
});
export type LedgerEntriesResponse = z.infer<typeof LedgerEntriesResponseSchema>;

export const VoidLedgerEntryResponseSchema = z.object({
  entryId: z.number().int().positive(),
  reversalId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  amount: z.number().int(),
});
export type VoidLedgerEntryResponse = z.infer<typeof VoidLedgerEntryResponseSchema>;
