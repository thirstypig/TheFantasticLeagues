/**
 * Contract: GET /api/player-season-stats
 *
 * Shared Zod schema — single source of truth for the wire format between the
 * Express server and the Vite client. Both sides import this file; the type
 * is inferred via `z.infer` so a drift between server response and client
 * expectation is a TypeScript compile error, not a runtime bug.
 *
 * Pilot schema — see docs/CONTRACT_TESTING.md for the pattern and how to add
 * more.
 *
 * Why this one first: Session 69 shipped the `normalizeTwoWayRow` bug where
 * the server returned `id` but the client's hand-written `PlayerSeasonStat`
 * type and its normalization step silently dropped it — the watchlist star
 * button short-circuited to null for every row. A shared schema would have
 * made that a type error the moment someone removed the field.
 */
import { z } from "zod";

/** One player row as returned by the /api/player-season-stats endpoint. */
export const PlayerSeasonStatSchema = z.object({
  /**
   * Prisma Player.id — stable DB identifier. Required (non-optional) on purpose:
   * the watchlist and several other features key off it. Dropping this field
   * from any transformation (normalizeTwoWayRow, etc.) must be a compile error.
   * This is the specific field Session 69's bug silently lost.
   */
  id: z.number(),
  mlb_id: z.string(),
  row_id: z.string().optional(),
  player_name: z.string().optional(),
  mlb_full_name: z.string().optional(),
  ogba_team_code: z.string().optional(),
  ogba_team_name: z.string().optional(),
  group: z.enum(["H", "P"]).optional(),
  is_pitcher: z.union([z.boolean(), z.number()]).optional(),
  positions: z.string().optional(),
  posPrimary: z.string().optional(),
  mlb_team: z.string().optional(),
  mlb_team_abbr: z.string().optional(),
  mlbTeam: z.string().optional(),
  price: z.number().optional(),

  // Hitter stats
  G: z.number().optional(),
  AB: z.number().optional(),
  H: z.number().optional(),
  R: z.number().optional(),
  HR: z.number().optional(),
  RBI: z.number().optional(),
  SB: z.number().optional(),
  AVG: z.union([z.number(), z.string()]).optional(),
  GS_HR: z.number().optional(),

  // Pitcher stats
  W: z.number().optional(),
  SV: z.number().optional(),
  K: z.number().optional(),
  IP: z.union([z.number(), z.string()]).optional(),
  ER: z.union([z.number(), z.string()]).optional(),
  ERA: z.union([z.number(), z.string()]).optional(),
  BB_H: z.union([z.number(), z.string()]).optional(),
  WHIP: z.union([z.number(), z.string()]).optional(),
  SHO: z.number().optional(),
  GS: z.number().optional(),
  SO: z.number().optional(),

  // Auction / value context
  dollar_value: z.number().optional(),
  value: z.number().optional(),
  z_total: z.number().optional(),
  fantasy_value: z.number().optional(),

  // Legacy aliases still referenced by some consumers
  pos: z.string().optional(),
  name: z.string().optional(),
  team: z.string().optional(),
  isPitcher: z.boolean().optional(),

  // Fields added by the Team page when merging roster data
  assignedPosition: z.string().optional(),
  isKeeper: z.boolean().optional(),
  rosterId: z.number().optional(),
});

/** The full response envelope. */
export const PlayerSeasonStatsResponseSchema = z.object({
  stats: z.array(PlayerSeasonStatSchema),
});

/** Inferred type used by both client and server. */
export type PlayerSeasonStat = z.infer<typeof PlayerSeasonStatSchema>;
export type PlayerSeasonStatsResponse = z.infer<typeof PlayerSeasonStatsResponseSchema>;
