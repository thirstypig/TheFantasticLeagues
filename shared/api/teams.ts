/**
 * Contract: GET /api/teams/:id/hub-roster (TeamService.getTeamRosterHub)
 *
 * Shared Zod schema — single source of truth for the wire format between the
 * Express server's `TeamService.getTeamRosterHub` emitter and the Vite client's
 * Team page consumer. Both sides infer their type from this schema; drift
 * between server response and client expectation becomes a TypeScript compile
 * error rather than a silent runtime null.
 *
 * Per todo #160 — `Team.tsx` previously hand-declared a loose `RosterPlayer`
 * interface that under-described the server payload (missing fields like
 * `mlbStatusDaysAgo` were never type-checked). Centralizing the contract here
 * follows the precedent set by `playerSeasonStats.ts` and `rosterMoves.ts`.
 */
import { z } from "zod";

/**
 * Numeric stat fields on a hub-roster row. Server emits real numbers when
 * the active period has stats for the player, and `undefined` for free-agents
 * / pre-stat-sync rows. Rate stats (AVG, ERA, WHIP) are derived numerically
 * by `TeamService.getTeamRosterHub` (e.g. `H / AB`) and ride the wire as
 * numbers — never strings — so the client can format consistently.
 */
const NumOrUndef = z.number().optional();

/**
 * One row in the hub roster (hitter, pitcher, or IL section). The shape is
 * intentionally a single union (not split per role) because the server emits
 * one shape and the client narrows on `isPitcher` downstream via
 * `toHubPlayer`. Stat fields are all optional so a hitter row simply has
 * pitcher fields undefined and vice-versa.
 */
export const RosterHubRowSchema = z.object({
  rosterId: z.number(),
  /** Prisma Player.id — stable across roster mutations (claim/drop). */
  playerId: z.number(),
  playerName: z.string(),
  /** Primary eligibility code (single position, e.g. "OF"). */
  posPrimary: z.string().nullable().optional(),
  /** Comma-separated full eligibility list ("OF,2B"). Falls back to posPrimary on the server. */
  posList: z.string().nullable().optional(),
  /** Mirror of posPrimary kept for legacy display callers. */
  position: z.string().nullable().optional(),
  /** Slot the player is currently rostered into ("OF", "BN", "IL", …). */
  assignedPosition: z.string().nullable().optional(),
  isPitcher: z.boolean(),
  price: z.number().nullable().optional(),
  mlbTeam: z.string().optional(),
  isKeeper: z.boolean().nullable().optional(),
  /** Synthetic per-position GP today (60/40 split); real values when Player.posGames lands. */
  gamesByPos: z.record(z.string(), z.number()).optional(),
  /** Verbatim MLB statsapi status — drives the ghost-IL chip. Null when unknown. */
  mlbStatus: z.string().nullable().optional(),
  // ---- Hitter stats ----
  AB: NumOrUndef,
  H: NumOrUndef,
  AVG: NumOrUndef,
  HR: NumOrUndef,
  R: NumOrUndef,
  RBI: NumOrUndef,
  SB: NumOrUndef,
  // ---- Pitcher stats ----
  IP: NumOrUndef,
  /** Hits + walks allowed combined (matches WHIP numerator). */
  BB_H: NumOrUndef,
  ER: NumOrUndef,
  W: NumOrUndef,
  SV: NumOrUndef,
  K: NumOrUndef,
  ERA: NumOrUndef,
  WHIP: NumOrUndef,
});
export type RosterHubRow = z.infer<typeof RosterHubRowSchema>;

/** Team identity block — matches the `select` clause in `getTeamSummary`. */
export const RosterHubTeamSchema = z.object({
  id: z.number(),
  leagueId: z.number(),
  name: z.string(),
  owner: z.string().nullable().optional(),
  budget: z.number().nullable().optional(),
});
export type RosterHubTeam = z.infer<typeof RosterHubTeamSchema>;

/** Active scoring period — null when no period exists for the league yet. */
export const RosterHubPeriodSchema = z
  .object({
    id: z.number(),
    leagueId: z.number(),
    name: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .nullable();
export type RosterHubPeriod = z.infer<typeof RosterHubPeriodSchema>;

/**
 * Dropped (released) roster row. Different shape from the active hub row —
 * no stats, no slot assignment, but carries `releasedAt`. Mirrored from
 * `getTeamSummary.droppedPlayers`.
 */
export const RosterHubDroppedPlayerSchema = z.object({
  id: z.number(),
  playerId: z.number(),
  name: z.string(),
  posPrimary: z.string().nullable().optional(),
  posList: z.string().nullable().optional(),
  acquiredAt: z.coerce.date(),
  releasedAt: z.coerce.date(),
  price: z.number().nullable().optional(),
  gamesByPos: z.record(z.string(), z.number()).optional(),
});
export type RosterHubDroppedPlayer = z.infer<typeof RosterHubDroppedPlayerSchema>;

/**
 * Top-level response from `GET /api/teams/:id/hub-roster`. The four row
 * arrays are partitioned server-side so the client never has to re-filter:
 *   - hitters: active non-pitcher rows, sorted by slot order then price desc
 *   - pitchers: active pitcher rows, sorted by slot then price desc
 *   - ilPlayers: rows whose assignedPosition === "IL"
 *   - droppedPlayers: historic drops for the team (different shape)
 */
export const RosterHubResponseSchema = z.object({
  team: RosterHubTeamSchema,
  period: RosterHubPeriodSchema,
  hitters: z.array(RosterHubRowSchema),
  pitchers: z.array(RosterHubRowSchema),
  ilPlayers: z.array(RosterHubRowSchema),
  droppedPlayers: z.array(RosterHubDroppedPlayerSchema),
});
export type RosterHubResponse = z.infer<typeof RosterHubResponseSchema>;
