// server/src/lib/rosterGuard.ts
// Shared guards: roster integrity checks.
//
// There are two modes:
//   - Pre-season / commissioner loading: `assertRosterLimit` — the ≤-cap check
//     that's been in use since day 1. Teams may be under-cap while rosters
//     are being filled.
//   - In-season strict: `assertRosterAtExactCap` — the exact-cap invariant
//     from Q1 of the 2026-04-21 roster-rules spec. Every roster transaction
//     must leave the team at exactly cap, never above, never below.

import { RosterRuleError } from "./rosterRuleError.js";
import { getLeagueRules } from "./leagueRuleCache.js";

type PrismaLike = {
  roster: {
    findFirst: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
  leagueRule: {
    findMany: (args: any) => Promise<Array<{ category: string; key: string; value: string }>>;
  };
};

/**
 * Throws if the player is already on an active roster in this league.
 * Legacy guard — superseded in new code by `assertNoOwnershipConflict` in
 * rosterWindow.ts which is window-aware.
 */
export async function assertPlayerAvailable(
  tx: PrismaLike,
  playerId: number,
  leagueId: number,
): Promise<void> {
  const existing = await tx.roster.findFirst({
    where: {
      playerId,
      releasedAt: null,
      team: { leagueId },
    },
    include: {
      player: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  if (existing) {
    const playerName = existing.player?.name ?? `Player #${playerId}`;
    const teamName = existing.team?.name ?? `Team #${existing.teamId}`;
    throw new Error(
      `${playerName} is already on ${teamName}'s active roster in this league`,
    );
  }
}

/** Fallback cap when league rule rows haven't been populated yet. */
const DEFAULT_ROSTER_MAX = 23;

/**
 * Load the per-league active roster cap from `LeagueRule` rows.
 * Cap = `roster.pitcher_count + roster.batter_count`. Falls back to 23 if
 * either rule is missing (pre-migration state or freshly-created league).
 *
 * IL slots are NOT part of the cap — they're extra capacity. See the plan's
 * Q4 answer (extra-capacity model).
 */
export async function loadLeagueRosterCap(
  tx: PrismaLike,
  leagueId: number,
): Promise<number> {
  const rules = await getLeagueRules(tx as any, leagueId);
  const pitcher = Number(rules.roster?.pitcher_count);
  const batter = Number(rules.roster?.batter_count);

  if (Number.isFinite(pitcher) && Number.isFinite(batter)) {
    return pitcher + batter;
  }
  return DEFAULT_ROSTER_MAX;
}

/**
 * Pre-season / commissioner tool guard — throws if adding a player would
 * exceed the team's roster limit. Accepts an optional drop (net change 0).
 *
 * Used when the roster invariant is ≤-cap (teams may be under-cap). For the
 * strict in-season invariant use `assertRosterAtExactCap`.
 */
export async function assertRosterLimit(
  tx: PrismaLike,
  teamId: number,
  isDroppingPlayer: boolean = false,
  maxRoster: number = DEFAULT_ROSTER_MAX,
): Promise<void> {
  const currentCount = await tx.roster.count({
    where: { teamId, releasedAt: null, assignedPosition: { not: "IL" } },
  });

  const projectedCount = currentCount + 1 - (isDroppingPlayer ? 1 : 0);

  if (projectedCount > maxRoster) {
    throw new RosterRuleError(
      "ROSTER_CAP",
      `Roster limit exceeded: team has ${currentCount} active players (max ${maxRoster}).${isDroppingPlayer ? "" : " You must drop a player to make room."}`,
      { currentCount, maxRoster, isDroppingPlayer },
    );
  }
}

/**
 * In-season strict guard — throws if the transaction would leave the team
 * off-cap. Every add must have a matching drop (and vice versa) so the
 * active roster count stays at exactly `expectedCap`.
 *
 * `delta` is the net change caused by this transaction's roster mutations:
 *   - A claim with dropPlayerId:  delta = 0 (1 add − 1 drop)
 *   - A claim without dropPlayerId: delta = +1 (violates invariant unless
 *     team is pre-filling and we're in pre-season — use assertRosterLimit)
 *   - A drop alone of an active player: delta = −1 (also violates — caller
 *     must supply a matching add, or the target must be an IL slot)
 *   - An IL stash+add: delta = 0 (active count unchanged; IL count +1)
 *   - An IL activate+drop: delta = 0 (active count unchanged; IL count −1)
 *
 * The helper is purely defensive: the endpoints enforce shape at the Zod
 * level, but this catches logic bugs where a code path writes an unbalanced
 * set of Roster mutations.
 */
export async function assertRosterAtExactCap(
  tx: PrismaLike,
  teamId: number,
  expectedCap: number,
  delta: number,
): Promise<void> {
  const currentActive = await tx.roster.count({
    where: { teamId, releasedAt: null, assignedPosition: { not: "IL" } },
  });

  const projected = currentActive + delta;

  if (projected !== expectedCap) {
    throw new RosterRuleError(
      "ROSTER_CAP",
      `Roster must be exactly at cap (${expectedCap}). Current active: ${currentActive}, projected after this transaction: ${projected}.`,
      { currentActive, projected, expectedCap, delta },
    );
  }
}
