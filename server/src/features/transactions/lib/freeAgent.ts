// server/src/features/transactions/lib/freeAgent.ts
//
// Single source of truth for "is this player a free agent in this league?"
// Extracted from `wire-list/routes.ts` (todo #175) so wire-list, legacy
// waivers (different policy today), and any future transaction path can
// share the same invariant. Mirrors the `transactions/lib/positionInherit`
// pattern already imported by `wire-list/processor.ts`.
//
// Policy:
//   1. Player must exist.
//   2. Player must NOT have an active (releasedAt = null) Roster row in
//      this league.
//   3. Player.mlbTeam must be either the literal "FA" sentinel OR an
//      abbreviation in the league's allowed-team set (per
//      getLeagueStatsSource / getTeamsForSource). When the source has no
//      filter (e.g. "ALL" / "Other"), getTeamsForSource returns null and
//      any non-empty MLB team is allowed.
//
// Fail-closed: empty string and null `mlbTeam` are INELIGIBLE. The prior
// `wire-list/routes.ts:128-132` implementation treated `team === ""` as
// allowed, which is the opposite direction — a player with an empty MLB
// team is by definition not on a roster *somewhere we can verify*, so we
// can't safely call them an FA. This tightening is the security half of
// todo #175.

import { prisma as defaultPrisma } from "../../../db/prisma.js";
import { Prisma } from "@prisma/client";
import { getLeagueStatsSource, getTeamsForSource } from "../../../lib/mlbTeams.js";

export type FreeAgentResult =
  | { ok: true }
  | { ok: false; status: number; body: { error: string; code: string } };

/**
 * Verify the player is a free agent in this league.
 *
 * Pass an optional `tx` to fold the read into an enclosing $transaction.
 * Note: getLeagueStatsSource currently uses the default prisma singleton
 * (cached league rules); the `tx` only routes the player + roster lookups
 * through the transaction client.
 */
export async function assertPlayerIsFreeAgent(
  playerId: number,
  leagueId: number,
  tx?: Prisma.TransactionClient,
): Promise<FreeAgentResult> {
  const db = tx ?? defaultPrisma;

  const player = await db.player.findUnique({
    where: { id: playerId },
    select: { id: true, mlbTeam: true },
  });
  if (!player) {
    return {
      ok: false,
      status: 404,
      body: { error: "Player not found", code: "PLAYER_NOT_FA" },
    };
  }

  const onRoster = await db.roster.findFirst({
    where: { playerId, releasedAt: null, team: { leagueId } },
    select: { id: true },
  });
  if (onRoster) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Player is already on a roster in this league",
        code: "PLAYER_NOT_FA",
      },
    };
  }

  // Stats-source enforcement. Read league rules via the default singleton
  // (cached); the tx only matters for the row-level reads above.
  const allowed = getTeamsForSource(await getLeagueStatsSource(leagueId));
  const team = player.mlbTeam ?? "";

  // Fail-closed on empty / null mlbTeam. The legacy implementation at
  // wire-list/routes.ts:128-132 treated `team === ""` as allowed; we
  // explicitly require either the FA sentinel or membership in the
  // allowed set.
  if (!team) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Player has no MLB team on file — not eligible",
        code: "PLAYER_NOT_FA",
      },
    };
  }

  if (team === "FA") {
    return { ok: true };
  }

  // No filter (source "ALL" / "Other"): any non-empty MLB team is fine.
  if (allowed === null) {
    return { ok: true };
  }

  if (!allowed.has(team)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Player's MLB team is outside this league's stats source",
        code: "PLAYER_NOT_FA",
      },
    };
  }

  return { ok: true };
}
