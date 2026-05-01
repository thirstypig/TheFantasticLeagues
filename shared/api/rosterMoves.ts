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

/**
 * Player row consumed by the RosterMovesTab panels (AddDropPanel,
 * PlaceOnIlPanel, ActivateFromIlPanel).
 *
 * The panels expect a heterogeneous array containing BOTH free-agent rows
 * (from `getPlayerSeasonStats` — no roster enrichment) and own-team roster
 * rows (joined with `getTeamDetails.currentRoster` so `_dbPlayerId`,
 * `_dbTeamId`, and `assignedPosition` are populated).
 *
 * Background: the panels filter drop/stash/IL candidates with
 *   `p._dbTeamId === teamId && (p._dbPlayerId ?? 0) > 0`
 * which means roster rows MUST carry those enrichment fields or the
 * dropdown will be empty. Until this schema landed, the type was an
 * all-optional bag at `client/.../RosterMovesTab/types.ts` and a raw
 * `getPlayerSeasonStats` payload could be cast in (via `as unknown as`)
 * with no compile-time signal that the enrichment was missing — the bug
 * pattern flagged in `MEMORY.md` `feedback_partial_browser_verification.md`
 * (todo #116).
 *
 * The schema below codifies the shape; `loadRosterMovePlayers()` is the
 * single producer that guarantees the enrichment fields are populated for
 * the active team.
 *
 * Identifier conventions (mirrors AddDropPanel comments):
 *   - `mlb_id` — set on every row (server `getPlayerSeasonStats`); panel
 *     keys the FA "add" selection on this. String to avoid float/int
 *     mismatches across legacy CSV vs DB rows.
 *   - `_dbPlayerId` — Prisma `Player.id`, only set on rows that joined
 *     against a `Roster` row. The panel's drop/stash/IL filters require
 *     this to be > 0.
 *   - `_dbTeamId` — Prisma `Team.id` of the rostering team. Used by the
 *     `tid === teamId` filter so a panel only offers the user's own
 *     roster as drop candidates.
 *   - `assignedPosition` — the literal slot the roster row currently
 *     fills (`"1B"`, `"OF"`, `"IL"`, `"BN"`, …). Distinct from
 *     `posPrimary` (the player's MLB primary position) — a player on the
 *     IL slot has `assignedPosition === "IL"` even though `posPrimary`
 *     is "1B". The Activate-from-IL panel splits its dropdowns on this
 *     exact distinction.
 *
 * All fields are marked optional at the wire level because both row
 * shapes flow through the same array. The loader contract guarantees
 * enrichment for own-team rows; the panels' runtime guards (`_dbPlayerId
 * ?? 0 > 0`) protect against stragglers.
 */
/**
 * Body: POST /api/transactions/sync-il-status
 *
 * Force a single-player MLB status refetch. Used by the v3 hub's
 * "Resync" affordance on the ghost-IL warning chip (IL scenario
 * direction-lock #3) — when a player on the active roster carries an
 * `mlbStatus` string but hasn't yet been auto-stashed (cron lag), the
 * UI surfaces a chip and lets the user trigger an out-of-band refetch.
 *
 * The response carries the freshly fetched status string verbatim
 * (per IL #1 — no normalization). When the player isn't on the team's
 * 40-man, `status` is null and the client should treat that as
 * "no MLB status; chip can be dismissed".
 */
export const SyncIlStatusBodySchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
});
export type SyncIlStatusBody = z.infer<typeof SyncIlStatusBodySchema>;

export const SyncIlStatusResponseSchema = z.object({
  playerId: z.number(),
  mlbId: z.number().nullable(),
  /** Raw MLB statsapi status string ("Injured 10-Day", "Active", …) or null
   *  when the player isn't on the team's 40-man. */
  mlbStatus: z.string().nullable(),
  fetchedAt: z.string(),
});
export type SyncIlStatusResponse = z.infer<typeof SyncIlStatusResponseSchema>;

// ── Roster-move request schemas (lifted from server/transactions/routes.ts, #194) ──
//
// Single source of truth for the wire format of the three v3 hub mutation
// endpoints. Both client and server import from here so a schema change
// produces a compile-time mismatch on either side. Keep the shape aligned
// with the route handlers in `server/src/features/transactions/routes.ts`.

/**
 * Tightened mlbId wire schema (#187 DoS hardening).
 *
 * Constrained to integer in (0, 9_999_999] or digits-only string of the
 * same magnitude. Real MLB IDs top out at ~6 digits today; the 7-digit
 * ceiling leaves headroom for derived Ohtani-style IDs.
 */
export const MlbIdSchema = z.union([
  z.number().int().positive().max(9_999_999),
  z.string().regex(/^\d{1,7}$/).transform(Number),
]);
export type MlbId = z.infer<typeof MlbIdSchema>;

/**
 * Body: POST /api/transactions/claim
 *
 * Either `playerId` (Prisma Player.id) or `mlbId` must be set —
 * the server prefers `playerId` when both are present.
 */
export const ClaimRequestSchema = z
  .object({
    leagueId: z.number().int().positive(),
    teamId: z.number().int().positive(),
    playerId: z.number().int().positive().optional(),
    mlbId: MlbIdSchema.optional(),
    dropPlayerId: z.number().int().positive().optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}($|T)/)
      .optional(),
  })
  .refine((d: { playerId?: number; mlbId?: number }) => d.playerId || d.mlbId, {
    message: "playerId or mlbId required",
  });
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

/**
 * Body: POST /api/transactions/il-stash
 *
 * Stash-only mode: omit both `addPlayerId` and `addMlbId`. The freed slot
 * stays empty and the server's bipartite matcher reshuffles the active
 * roster from BN.
 */
export const IlStashRequestSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  stashPlayerId: z.number().int().positive(),
  addPlayerId: z.number().int().positive().optional(),
  addMlbId: MlbIdSchema.optional(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}($|T)/)
    .optional(),
  reason: z.string().max(500).optional(),
});
export type IlStashRequest = z.infer<typeof IlStashRequestSchema>;

/**
 * Body: POST /api/transactions/il-activate
 *
 * Atomic activate + drop. Both player ids are required; both must be on
 * the team's roster (one on IL, one on active).
 */
export const IlActivateRequestSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  activatePlayerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}($|T)/)
    .optional(),
  reason: z.string().max(500).optional(),
});
export type IlActivateRequest = z.infer<typeof IlActivateRequestSchema>;

/**
 * Auto-resolve reassignment echoed by the server when the bipartite matcher
 * shuffles other roster rows to fit the new player legally. The client uses
 * this to render a toast like "Also moved: Trea Turner 2B → SS".
 */
export const AppliedReassignmentSchema = z.object({
  rosterId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  playerName: z.string(),
  oldSlot: z.string(),
  newSlot: z.string(),
});
export type AppliedReassignment = z.infer<typeof AppliedReassignmentSchema>;

/**
 * Response: POST /api/transactions/claim
 */
export const ClaimResponseSchema = z.object({
  success: z.literal(true),
  playerId: z.number().int().positive(),
  /** mlbId of the claimed player when known; null for synthetic rows. */
  mlbId: z.number().nullable().optional(),
  /** Display name of the claimed player — used for client toasts without
   *  forcing a follow-up player-detail fetch. */
  name: z.string().optional(),
  appliedReassignments: z.array(AppliedReassignmentSchema).optional(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

/**
 * Response: POST /api/transactions/il-stash
 */
export const IlStashResponseSchema = z.object({
  success: z.literal(true),
  stashPlayerId: z.number().int().positive(),
  addPlayerId: z.number().int().positive().nullable(),
  stashOnly: z.boolean(),
  /** Identifying fields of the stashed player (always present). */
  stashMlbId: z.number().nullable().optional(),
  stashName: z.string().optional(),
  /** Identifying fields of the added player (null in stash-only mode). */
  addMlbId: z.number().nullable().optional(),
  addName: z.string().nullable().optional(),
  appliedReassignments: z.array(AppliedReassignmentSchema).optional(),
});
export type IlStashResponse = z.infer<typeof IlStashResponseSchema>;

/**
 * Response: POST /api/transactions/il-activate
 */
export const IlActivateResponseSchema = z.object({
  success: z.literal(true),
  activatePlayerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive(),
  activateMlbId: z.number().nullable().optional(),
  activateName: z.string().optional(),
  dropMlbId: z.number().nullable().optional(),
  dropName: z.string().optional(),
  appliedReassignments: z.array(AppliedReassignmentSchema).optional(),
});
export type IlActivateResponse = z.infer<typeof IlActivateResponseSchema>;

export const RosterMovesPlayerSchema = z.object({
  // Identification — at least one of (mlb_id, _dbPlayerId) must be set.
  mlb_id: z.union([z.string(), z.number()]).optional(),
  mlbId: z.union([z.string(), z.number()]).optional(),
  player_name: z.string().optional(),
  name: z.string().optional(),

  // Enrichment fields — populated by `loadRosterMovePlayers` when the
  // row corresponds to a Roster entry on the active team.
  _dbPlayerId: z.number().optional(),
  _dbTeamId: z.number().optional(),
  assignedPosition: z.string().optional(),

  // Position metadata — drives slot-eligibility checks.
  posPrimary: z.string().optional(),
  positions: z.string().optional(),

  // Status flags.
  mlbStatus: z.string().optional(),
  is_pitcher: z.union([z.boolean(), z.number()]).optional(),

  // Team-pool metadata used as a fallback by ActivityPage (`teams.find(t
  // => t.name === p.ogba_team_name)?.id`). Kept on the schema so the
  // loader's mapping doesn't strip it.
  ogba_team_code: z.string().optional(),
  ogba_team_name: z.string().optional(),
  team: z.string().optional(),
});
export type RosterMovesPlayer = z.infer<typeof RosterMovesPlayerSchema>;
