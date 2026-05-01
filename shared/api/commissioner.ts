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
