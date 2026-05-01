/**
 * Contract: roster-moves wire schemas
 *
 * Source-of-truth Zod schemas for the Yahoo-style roster moves PR2 endpoints.
 * Both client and server import from here; `z.infer` keeps the wire shape
 * synchronized.
 *
 * Plan: docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md §0
 *
 * Why this matters: PR1 used `string` for slot codes everywhere, which let
 * typos (`"of"` vs `"OF"`, `"OF1"` etc.) survive into runtime. The literal
 * union below makes drift a compile error. The eligible-slots endpoint is
 * the first consumer; the v3 client wiring will adopt it next.
 */
import { z } from "zod";

/**
 * Canonical slot codes matching `client/src/lib/sports/baseball.ts:POSITIONS`
 * and `server/src/lib/sports/baseball.ts`. Includes IL + BN. The pitcher
 * sub-codes (SP, RP) are aggregated to "P" in the OGBA roster but kept here
 * so future leagues with split pitcher slots can use the same schema.
 */
export const SlotCodeSchema = z.enum([
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "CM",
  "OF",
  "DH",
  "P",
  "SP",
  "RP",
  "BN",
  "IL",
]);
export type SlotCode = z.infer<typeof SlotCodeSchema>;

/**
 * Per-position eligibility breakdown — what slots each declared position can
 * fill. Matches `positionToSlots()` in `server/src/lib/sports/baseball.ts`.
 */
export const PositionEligibilitySchema = z.object({
  position: z.string(),
  slots: z.array(SlotCodeSchema),
});
export type PositionEligibility = z.infer<typeof PositionEligibilitySchema>;

/**
 * Response: GET /api/players/:mlbId/eligible-slots?leagueId=<num>
 *
 * Server-side wrapper around `positionToSlots(posList)` — gives agents and
 * the v3 client a way to ask "which slots can this player fill?" without
 * re-implementing the position-mapping table client-side.
 *
 * `eligibleSlots` is the union (deduped) across every position in `posList`.
 * `perPosition` carries the breakdown for UI cells that want to show e.g.
 * "OF (12) · 2B (3) · MI" — the GP suffixes come from a sibling endpoint
 * (`Player.posGames`) shipped in a later PR.
 */
export const EligibleSlotsResponseSchema = z.object({
  playerId: z.number(),
  mlbId: z.number().nullable(),
  name: z.string(),
  posList: z.string(),
  eligibleSlots: z.array(SlotCodeSchema),
  perPosition: z.array(PositionEligibilitySchema),
});
export type EligibleSlotsResponse = z.infer<typeof EligibleSlotsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────
// Roster-move request schemas (todo #136)
// ─────────────────────────────────────────────────────────────────────
//
// Source-of-truth Zod schemas for the three roster-move POST endpoints in
// `server/src/features/transactions/routes.ts`. The server imports these via
// `validateBody()`; the client uses the inferred types in `api.ts`. Keeping
// both sides on one schema means a renamed field is a compile error on the
// other side, not a 400 at runtime.
//
// Fields mirror the inline schemas they replaced (commit history of
// transactions/routes.ts has the original definitions). The hardened
// `MlbIdSchema` was lifted in PR1 (todo #135) — it rejects `Infinity`, `NaN`,
// `1.5e10`, and non-digit strings.

/**
 * MLB ID — accepts a positive int up to 9_999_999 or a numeric string that
 * transforms to number. Rejects floats, NaN, Infinity, scientific notation,
 * and any string with non-digit characters.
 *
 * Why 9_999_999: real MLB IDs are 6–7 digits today; this gives us room for
 * 8-digit growth while still rejecting `1.5e10` and similar overflow-style
 * payloads.
 */
export const MlbIdSchema = z.union([
  z.number().int().positive().max(9_999_999),
  z.string().regex(/^\d+$/).transform(Number),
]);
export type MlbId = z.infer<typeof MlbIdSchema>;

/**
 * Optional ISO-date or full ISO-datetime; commissioner backdate. Null/omit =
 * server falls back to `nextDayEffective()`.
 */
export const EffectiveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}($|T)/, "effectiveDate must be YYYY-MM-DD or ISO datetime");

/**
 * POST /api/transactions/claim — body schema.
 *
 * `playerId` XOR `mlbId` is required; both are optional individually so the
 * caller can supply whichever it has, but at least one must be present
 * (enforced via `.refine`).
 */
export const ClaimRequestSchema = z
  .object({
    leagueId: z.number().int().positive(),
    teamId: z.number().int().positive(),
    playerId: z.number().int().positive().optional(),
    mlbId: MlbIdSchema.optional(),
    dropPlayerId: z.number().int().positive().optional(),
    effectiveDate: EffectiveDateSchema.optional(),
  })
  .refine((d) => d.playerId != null || d.mlbId != null, {
    message: "playerId or mlbId required",
  });
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

/**
 * POST /api/transactions/il-stash — body schema.
 *
 * Stash player must already be on the team's active roster. Add player is
 * the replacement on the slot just vacated; `addPlayerId` XOR `addMlbId`.
 */
export const IlStashRequestSchema = z
  .object({
    leagueId: z.number().int().positive(),
    teamId: z.number().int().positive(),
    stashPlayerId: z.number().int().positive(),
    addPlayerId: z.number().int().positive().optional(),
    addMlbId: MlbIdSchema.optional(),
    effectiveDate: EffectiveDateSchema.optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => d.addPlayerId != null || d.addMlbId != null, {
    message: "addPlayerId or addMlbId required",
  });
export type IlStashRequest = z.infer<typeof IlStashRequestSchema>;

/**
 * POST /api/transactions/il-activate — body schema.
 *
 * Activate player must be on the team's IL slot; drop player must be on the
 * active roster (not IL). Both required (no XOR — atomic activate-and-drop).
 */
export const IlActivateRequestSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  activatePlayerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive(),
  effectiveDate: EffectiveDateSchema.optional(),
  reason: z.string().max(500).optional(),
});
export type IlActivateRequest = z.infer<typeof IlActivateRequestSchema>;

// ─────────────────────────────────────────────────────────────────────
// Roster-move response schemas (todo #136)
// ─────────────────────────────────────────────────────────────────────
//
// Echo `mlbId` and `name` of the affected player(s) so the client can render
// success toasts without a second round-trip ("Claimed Mookie Betts (#605141)
// — also moved Trea Turner 2B → SS"). The auto-resolve `appliedReassignments`
// payload remains as it was — these schemas just document the fields the
// client already relies on plus the new echo fields.

/** Single auto-resolve reassignment, mirrors `AppliedReassignment` in autoResolveLineup.ts. */
export const AppliedReassignmentSchema = z.object({
  rosterId: z.number(),
  playerId: z.number(),
  playerName: z.string(),
  oldSlot: z.string(),
  newSlot: z.string(),
});
export type AppliedReassignment = z.infer<typeof AppliedReassignmentSchema>;

/** POST /api/transactions/claim — success response (200). */
export const ClaimResponseSchema = z.object({
  success: z.literal(true),
  playerId: z.number(),
  mlbId: z.number().nullable(),
  name: z.string(),
  appliedReassignments: z.array(AppliedReassignmentSchema),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

/** POST /api/transactions/il-stash — success response (200). */
export const IlStashResponseSchema = z.object({
  success: z.literal(true),
  stashPlayerId: z.number(),
  stashPlayerMlbId: z.number().nullable(),
  stashPlayerName: z.string(),
  addPlayerId: z.number(),
  addPlayerMlbId: z.number().nullable(),
  addPlayerName: z.string(),
  appliedReassignments: z.array(AppliedReassignmentSchema),
});
export type IlStashResponse = z.infer<typeof IlStashResponseSchema>;

/** POST /api/transactions/il-activate — success response (200). */
export const IlActivateResponseSchema = z.object({
  success: z.literal(true),
  activatePlayerId: z.number(),
  activatePlayerMlbId: z.number().nullable(),
  activatePlayerName: z.string(),
  dropPlayerId: z.number(),
  dropPlayerMlbId: z.number().nullable(),
  dropPlayerName: z.string(),
  appliedReassignments: z.array(AppliedReassignmentSchema),
});
export type IlActivateResponse = z.infer<typeof IlActivateResponseSchema>;
