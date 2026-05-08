/**
 * Contract: /api/wire-list/* — Wire List two-list waiver model
 *
 * Source-of-truth Zod schemas for the two-list Wire List feature shipped
 * after PRs #255 (preview) + #256 (schema). This is the owner-facing CRUD
 * surface. The legacy `/api/waivers` endpoints (paired-row WaiverClaim) are
 * untouched and run side-by-side until the legacy auto-engine is retired.
 *
 * Spec reference: memory entry `waiver_wire_list_feature.md` (8 direction-locks)
 *   and `docs/decisions.md` ADR-012 (two-list vs paired vs polymorphic).
 */
import { z } from "zod";

// ─── Enums (mirror Prisma) ───────────────────────────────────────────

export const WaiverDropModeSchema = z.enum(["RELEASE", "IL_STASH"]);
export type WaiverDropMode = z.infer<typeof WaiverDropModeSchema>;

// CANCELLED is intentionally absent from the Zod schema — no code path sets it
// for wire-list periods. The Prisma enum still has it (removing would require
// a migration). Reintroduce here when a cancel endpoint actually ships.
export const WaiverPeriodStatusSchema = z.enum([
  "PENDING",
  "LOCKED",
  "PROCESSED",
]);
export type WaiverPeriodStatus = z.infer<typeof WaiverPeriodStatusSchema>;

export const WaiverAddOutcomeSchema = z.enum([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
]);
export type WaiverAddOutcome = z.infer<typeof WaiverAddOutcomeSchema>;

export const WaiverDropStatusSchema = z.enum([
  "PENDING",
  "CONSUMED",
  "UNUSED",
]);
export type WaiverDropStatus = z.infer<typeof WaiverDropStatusSchema>;

// ─── Period ──────────────────────────────────────────────────────────

/**
 * POST /api/wire-list/leagues/:leagueId/periods — leagueId comes from path,
 * not body, so the body holds only the deadline.
 */
export const CreatePeriodBodySchema = z.object({
  /** ISO 8601 timestamp; must be in the future. */
  deadlineAt: z.string().datetime(),
});
export type CreatePeriodBody = z.infer<typeof CreatePeriodBodySchema>;

export const PeriodResponseSchema = z.object({
  id: z.number().int().positive(),
  leagueId: z.number().int().positive(),
  deadlineAt: z.string(),
  lockedAt: z.string().nullable(),
  processedAt: z.string().nullable(),
  status: WaiverPeriodStatusSchema,
  createdAt: z.string(),
});
export type PeriodResponse = z.infer<typeof PeriodResponseSchema>;

// ─── Add entry ───────────────────────────────────────────────────────

export const CreateAddEntryBodySchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  // priority is server-assigned (next available). The optional client-supplied
  // priority was dead code per todo #177; reorder now goes through the atomic
  // `/reorder` endpoint (PR #278). Reintroduce only if a bulk-import path needs it.
});
export type CreateAddEntryBody = z.infer<typeof CreateAddEntryBodySchema>;

export const UpdateAddEntryBodySchema = z.object({
  priority: z.number().int().positive().max(999),
});
export type UpdateAddEntryBody = z.infer<typeof UpdateAddEntryBodySchema>;

/**
 * POST /api/wire-list/periods/:periodId/reorder — atomic reorder of all
 * Add or Drop entries for a (period, team, kind). Replaces the legacy 3-call
 * swap dance (todo #159). Server rewrites priorities in a single transaction
 * using a two-pass (negative-temp then final) technique to dodge the
 * `(periodId, teamId, priority)` unique constraint.
 */
export const ReorderEntriesBodySchema = z.object({
  kind: z.enum(["ADD", "DROP"]),
  teamId: z.number().int().positive(),
  /** New ordering — index 0 becomes priority 1, index 1 becomes priority 2, etc. */
  orderedIds: z.array(z.number().int().positive()).min(1),
});
export type ReorderEntriesBody = z.infer<typeof ReorderEntriesBodySchema>;

export const AddEntryResponseSchema = z.object({
  id: z.number().int().positive(),
  periodId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  priority: z.number().int().positive(),
  outcome: WaiverAddOutcomeSchema,
  consumedDropEntryId: z.number().int().positive().nullable(),
  reason: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AddEntryResponse = z.infer<typeof AddEntryResponseSchema>;

// ─── Drop entry ──────────────────────────────────────────────────────

export const CreateDropEntryBodySchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  // priority is server-assigned (see CreateAddEntryBody note above).
  dropMode: WaiverDropModeSchema.optional(),
});
export type CreateDropEntryBody = z.infer<typeof CreateDropEntryBodySchema>;

export const UpdateDropEntryBodySchema = z
  .object({
    priority: z.number().int().positive().max(999).optional(),
    dropMode: WaiverDropModeSchema.optional(),
  })
  .refine(
    (v: { priority?: number; dropMode?: WaiverDropMode }) =>
      v.priority !== undefined || v.dropMode !== undefined,
    { message: "At least one of priority or dropMode must be provided" },
  );
export type UpdateDropEntryBody = z.infer<typeof UpdateDropEntryBodySchema>;

export const DropEntryResponseSchema = z.object({
  id: z.number().int().positive(),
  periodId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  priority: z.number().int().positive(),
  dropMode: WaiverDropModeSchema,
  status: WaiverDropStatusSchema,
  processedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DropEntryResponse = z.infer<typeof DropEntryResponseSchema>;

// ─── Outcome / processor bodies ──────────────────────────────────────

/**
 * POST /api/wire-list/adds/:id/fail — reason required (commissioner explains why).
 */
export const FailOutcomeBodySchema = z.object({
  reason: z.string().min(1).max(280),
});
export type FailOutcomeBody = z.infer<typeof FailOutcomeBodySchema>;

/**
 * POST /api/wire-list/adds/:id/skip — reason optional (often a tactical decision).
 */
export const SkipOutcomeBodySchema = z.object({
  reason: z.string().min(1).max(280).optional(),
});
export type SkipOutcomeBody = z.infer<typeof SkipOutcomeBodySchema>;

/**
 * @deprecated Use FailOutcomeBodySchema or SkipOutcomeBodySchema directly.
 * Retained as the loose superset for any caller that hasn't split yet.
 */
export const RecordOutcomeBodySchema = SkipOutcomeBodySchema;
export type RecordOutcomeBody = z.infer<typeof RecordOutcomeBodySchema>;

/**
 * GET /api/wire-list/periods/:id/results — read-only multi-team view.
 */
export const PeriodResultsResponseSchema = z.object({
  period: PeriodResponseSchema,
  byTeam: z.array(
    z.object({
      teamId: z.number().int().positive(),
      adds: z.array(AddEntryResponseSchema),
      drops: z.array(DropEntryResponseSchema),
    }),
  ),
});
export type PeriodResultsResponse = z.infer<typeof PeriodResultsResponseSchema>;

// ─── Error codes ─────────────────────────────────────────────────────

/**
 * Stable error `code` strings returned by the API. Clients should switch on
 * these rather than parsing the human-readable `error` field.
 */
export const WireListErrorCodeSchema = z.enum([
  "PERIOD_NOT_PENDING",
  "PERIOD_NOT_FOUND",
  "DEADLINE_IN_PAST",
  "PLAYER_NOT_FA",
  "PLAYER_NOT_ON_TEAM",
  "ACQUIRED_THIS_PERIOD",
  "DUPLICATE_PLAYER",
  "DUPLICATE_PRIORITY",
  "ENTRY_NOT_FOUND",
  "ENTRY_NOT_OWNED",
  "ENTRY_ALREADY_PROCESSED",
  "PERIOD_NOT_LOCKED",
  "NO_DROP_AVAILABLE",
  "POSITION_INCOMPATIBLE",
  "FINALIZE_BLOCKED",
  "DROP_RACE_LOST",
  "FINALIZE_RACE_LOST",
  "REORDER_IDS_MISMATCH",
]);
export type WireListErrorCode = z.infer<typeof WireListErrorCodeSchema>;
