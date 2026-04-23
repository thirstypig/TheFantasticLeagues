// server/src/lib/ilSlotGuard.ts
// Guards for IL slot invariants — MLB-IL eligibility, slot-cap, ghost-IL.
//
// Conventions from the plan (2026-04-21):
//   - Eligibility (Q5, Q6): player's MLB status must be an "Injured …-Day"
//     designation (10/15/60-Day IL — MLB statsapi formats these as
//     "Injured 10-Day", "Injured 60-Day", etc.; the legacy "Injured List
//     10-Day" form is also accepted for forward compat). Paternity /
//     bereavement / restricted / suspended / minors do NOT qualify.
//   - Extra-capacity model (Q4): IL slots live outside the active roster cap.
//     League's `il.slot_count` rule controls how many (default 2).
//   - Ghost-IL block (Q12, plan R9): fails CLOSED on feed unavailability for
//     write paths (stash rejected); UI detection fails open (read-only).
//
// All eligibility checks here run PRE-TRANSACTION — we never hold row locks
// while making HTTPS calls to the MLB API (performance review).

import { RosterRuleError } from "./rosterRuleError.js";
import { getMlbPlayerStatus, type MlbRosterStatus } from "./mlbApi.js";
import { prisma } from "../db/prisma.js";
import { getLeagueRules } from "./leagueRuleCache.js";

type PrismaLike = {
  roster: {
    count: (args: any) => Promise<number>;
    findMany: (args: any) => Promise<any[]>;
  };
  leagueRule: {
    findFirst: (args: any) => Promise<any | null>;
  };
};

/**
 * Evidence captured at the moment of IL eligibility check — threaded through
 * to the transaction and stored on the resulting `RosterSlotEvent` row for
 * audit. Records "what the commissioner saw at stash time" so disputes have
 * a trail even if the MLB status changed minutes later.
 */
export type MlbStatusCheck = {
  status: string;         // e.g. "Injured 10-Day" (raw MLB statsapi format)
  cacheFetchedAt: Date;   // when the 40-man feed data was pulled
};

/** Fallback when an IL slot_count rule hasn't been populated yet. */
const DEFAULT_IL_SLOT_COUNT = 2;

/**
 * Does this MLB status qualify for an IL slot?
 * Plan Q6: only the MLB "Injured …-Day" designations qualify. Paternity /
 * bereavement / restricted / suspended do not. The MLB statsapi 40-man feed
 * returns these as `"Injured 10-Day"` / `"Injured 15-Day"` / `"Injured 60-Day"`
 * (not `"Injured List 10-Day"` — that variant is kept as a defensive
 * forward-compat match in case MLB ever changes the string).
 */
const MLB_IL_STATUS_RE = /^Injured (List )?\d+-Day$/;

export function isMlbIlStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return MLB_IL_STATUS_RE.test(status);
}

/**
 * Pre-transaction eligibility check. Fails CLOSED on feed unavailability —
 * throws `MLB_FEED_UNAVAILABLE` so stashes are rejected when we can't verify.
 *
 * Returns an `MlbStatusCheck` for evidence capture.
 */
export async function checkMlbIlEligibility(
  playerId: number,
): Promise<MlbStatusCheck> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true, mlbId: true, mlbTeam: true },
  });

  if (!player) {
    throw new RosterRuleError("IL_UNKNOWN_PLAYER",
      `Player #${playerId} not found.`, { playerId });
  }

  if (!player.mlbId || !player.mlbTeam) {
    throw new RosterRuleError("MLB_IDENTITY_MISSING",
      `${player.name} has no MLB identity on file — cannot verify IL status.`,
      { playerId, hasMlbId: !!player.mlbId, hasMlbTeam: !!player.mlbTeam });
  }

  let result: MlbRosterStatus | null;
  try {
    result = await getMlbPlayerStatus(player.mlbId, player.mlbTeam);
  } catch (err) {
    // Fail CLOSED — network/feed errors can't be treated as "status unknown,
    // allow it." A malicious or unlucky timing would otherwise let a
    // non-IL player be stashed during an outage (plan R9).
    throw new RosterRuleError("MLB_FEED_UNAVAILABLE",
      `MLB status feed is unavailable right now; cannot verify ${player.name}'s IL status. Try again in a few minutes.`,
      { playerId, mlbId: player.mlbId, error: err instanceof Error ? err.message : String(err) });
  }

  if (!result) {
    // Player not on 40-man — happens when they're designated for assignment,
    // optioned and removed from 40-man, or mid-transition. Not IL-eligible.
    throw new RosterRuleError("NOT_MLB_IL",
      `${player.name} is not currently on ${player.mlbTeam}'s 40-man roster — not eligible for an IL slot.`,
      { playerId, mlbId: player.mlbId, mlbTeam: player.mlbTeam });
  }

  if (!isMlbIlStatus(result.status)) {
    throw new RosterRuleError("NOT_MLB_IL",
      `${player.name}'s MLB status is "${result.status}" — not eligible for an IL slot. Only "Injured …-Day" statuses (10/15/60-Day IL) qualify.`,
      { playerId, mlbStatus: result.status });
  }

  return {
    status: result.status,
    cacheFetchedAt: new Date(result.fetchedAt),
  };
}

/**
 * Read `il.slot_count` rule for a league, falling back to the default
 * (2) if the rule hasn't been populated yet.
 */
export async function loadLeagueIlSlotCount(
  tx: PrismaLike,
  leagueId: number,
): Promise<number> {
  const rules = await getLeagueRules(tx as any, leagueId);
  const n = Number(rules.il?.slot_count);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_IL_SLOT_COUNT;
  return n;
}

/**
 * Throws if the team already has `il.slot_count` (or more) active IL-slotted
 * roster rows. Must run inside the transaction after `SELECT FOR UPDATE` on
 * the Team row to prevent concurrent stashes from racing past the cap.
 */
export async function assertIlSlotAvailable(
  tx: PrismaLike,
  teamId: number,
  leagueId: number,
): Promise<void> {
  const slotCount = await loadLeagueIlSlotCount(tx, leagueId);
  const current = await tx.roster.count({
    where: { teamId, releasedAt: null, assignedPosition: "IL" },
  });
  if (current >= slotCount) {
    throw new RosterRuleError("IL_SLOT_FULL",
      `Team has ${current} of ${slotCount} IL slots in use — activate someone before stashing another player.`,
      { currentInIl: current, slotCount });
  }
}

/**
 * Find players this team has in IL slots whose MLB status is no longer
 * an "Injured …-Day" designation (ghost-IL). Used by:
 *   - `assertNoGhostIl` to block new stashes while ghost-IL exists (plan Q12 = b)
 *   - The commissioner dashboard banner and per-team UI badge
 *   - The `auditRosterRules.ts` pre-ship report
 *
 * This function does its own MLB-status fetches. It does NOT fail closed on
 * feed unavailability — that's a detection/read path, not a write path.
 * Callers handle missing status as "unknown, skip" rather than "treat as
 * ghost" (we can't label something ghost-IL unless we actively know MLB
 * considers them active).
 */
export async function listGhostIlPlayersForTeam(
  tx: PrismaLike,
  teamId: number,
): Promise<Array<{ rosterId: number; playerId: number; playerName: string; currentMlbStatus: string }>> {
  const ilRows = await tx.roster.findMany({
    where: { teamId, releasedAt: null, assignedPosition: "IL" },
    select: {
      id: true,
      playerId: true,
      player: { select: { name: true, mlbId: true, mlbTeam: true } },
    },
  });

  const ghosts: Array<{ rosterId: number; playerId: number; playerName: string; currentMlbStatus: string }> = [];
  for (const row of ilRows) {
    if (!row.player?.mlbId || !row.player?.mlbTeam) continue;
    let status: MlbRosterStatus | null;
    try {
      status = await getMlbPlayerStatus(row.player.mlbId, row.player.mlbTeam);
    } catch {
      continue; // feed unavailable — skip rather than label ghost
    }
    if (!status) continue;
    if (!isMlbIlStatus(status.status)) {
      ghosts.push({
        rosterId: row.id,
        playerId: row.playerId,
        playerName: row.player.name,
        currentMlbStatus: status.status,
      });
    }
  }

  return ghosts;
}

/**
 * Block any new IL stash while the team has a ghost-IL player. The UI
 * remedy is to activate or drop the ghost-IL player first.
 */
export async function assertNoGhostIl(
  tx: PrismaLike,
  teamId: number,
): Promise<void> {
  const ghosts = await listGhostIlPlayersForTeam(tx, teamId);
  if (ghosts.length > 0) {
    const names = ghosts.map(g => g.playerName).join(", ");
    throw new RosterRuleError("GHOST_IL",
      `Team has ghost-IL player${ghosts.length > 1 ? "s" : ""} (${names}) whose MLB status is no longer an "Injured …-Day" designation. Activate or drop them before stashing another player.`,
      { ghostCount: ghosts.length, ghostPlayerIds: ghosts.map(g => g.playerId) });
  }
}
