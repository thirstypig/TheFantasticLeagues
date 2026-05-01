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
 * Full wire vocabulary derived from `SlotCodeSchema`. Single source of truth
 * for any consumer that needs to enumerate every legal slot code (including
 * structural slots BN/IL and the pitcher sub-codes SP/RP). Replaces ad-hoc
 * `as const` arrays scattered across the codebase — see todo #132.
 *
 * Note: `lib/sports/baseball.ts` re-exports `ELIGIBILITY_SLOT_CODES` (below)
 * as its `SLOT_CODES` because the eligibility helper `positionToSlots` only
 * produces the output-slot subset.
 */
export const SLOT_CODES = SlotCodeSchema.options;

/**
 * Eligibility-slot subset — output codes that `positionToSlots()` can produce.
 * Excludes structural slots (BN, IL — never produced by eligibility math) and
 * input-only pitcher sub-codes (SP, RP — collapse to "P" in OGBA rosters).
 *
 * Used by the client `slotsFor`/`isSlotCode` helpers and by the v3 hub when
 * narrowing arbitrary string keys onto the SlotCode literal union.
 */
export const ELIGIBILITY_SLOT_CODES = [
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
] as const satisfies readonly SlotCode[];
export type EligibilitySlotCode = typeof ELIGIBILITY_SLOT_CODES[number];

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
