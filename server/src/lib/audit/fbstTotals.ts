// server/src/lib/audit/fbstTotals.ts
import { emptyStatLine, type StatLine } from "./types.js";
import { playerStatRoles } from "../sportConfig.js";

export interface RosterStint {
  teamId: number;
  playerId: number;
  acquiredAt: Date;
  releasedAt: Date | null;
  assignedPosition: string | null;
  posPrimary: string | null;
  /**
   * Two-way players (Ohtani) are slotted per period, so their contribution
   * follows `assignedPosition`; everyone else is keyed on `posPrimary` alone.
   * Source it the same way production does:
   * `mlbId ? TWO_WAY_PLAYERS.has(mlbId) : false`.
   */
  isTwoWay: boolean;
}

/**
 * Is this roster stint inside the period's scoring window?
 *
 * THE SINGLE DEFINITION. `computeTeamPeriodTotals` and `findCoverageGaps` must
 * agree on this exactly: the first decides whose stats are counted, the second
 * decides whose MISSING stats make the run INCOMPLETE. If they drift, a player
 * the accumulator counts can be skipped by the gap-finder, and a run with
 * missing data reports PASS — the one outcome the audit spec's Global
 * Constraint forbids. They used to be two hand-written copies of these three
 * predicates in two different files. Do not re-inline it.
 *
 * Boundary semantics, pinned by tests in fbstTotals.test.ts:
 *   - acquiredAt EXACTLY on endDate   -> in window  (`>` excludes, not `>=`)
 *   - releasedAt EXACTLY on startDate -> out        (`<=` excludes)
 *   - releasedAt EXACTLY on endDate   -> in window
 */
export function isInPeriodWindow(args: {
  stint: Pick<RosterStint, "playerId" | "acquiredAt" | "releasedAt">;
  period: { startDate: Date; endDate: Date };
  isOnIlAtPeriodStart: (playerId: number) => boolean;
}): boolean {
  const { stint, period, isOnIlAtPeriodStart } = args;
  if (stint.acquiredAt > period.endDate) return false;
  if (stint.releasedAt && stint.releasedAt <= period.startDate) return false;
  if (isOnIlAtPeriodStart(stint.playerId)) return false;
  return true;
}

/**
 * Per-team period totals from PlayerStatsPeriod, using the same window and IL
 * rules as audit_period.ts — plus a per-team dedup guard that audit_period.ts
 * lacks (a same-period drop-and-re-add would otherwise count twice; see PR #402).
 *
 * Pure: all I/O is the caller's job, so this is unit-testable with no DB.
 */
export function computeTeamPeriodTotals(args: {
  teams: { id: number; name: string }[];
  rosters: RosterStint[];
  pspByPlayer: Map<number, StatLine>;
  period: { startDate: Date; endDate: Date };
  isOnIlAtPeriodStart: (playerId: number) => boolean;
}): Map<number, StatLine> {
  const { teams, rosters, pspByPlayer, period, isOnIlAtPeriodStart } = args;

  const acc = new Map<number, StatLine>(teams.map((t) => [t.id, emptyStatLine()]));
  const counted = new Set<string>(); // `${teamId}:${playerId}` — the PR #402 guard

  for (const r of rosters) {
    if (!isInPeriodWindow({ stint: r, period, isOnIlAtPeriodStart })) continue;

    const key = `${r.teamId}:${r.playerId}`;
    if (counted.has(key)) continue;

    const ps = pspByPlayer.get(r.playerId);
    if (!ps) continue;

    const a = acc.get(r.teamId);
    if (!a) continue;

    counted.add(key);

    // Classify through the PRODUCTION rule rather than re-deriving it (todo
    // #307). The audit previously split on `assignedPosition ?? posPrimary`,
    // which drops a benched pitcher's pitching — an under-report by the
    // instrument only, reported as if production were wrong. Same reasoning as
    // `rosterSlotFor` (PR #435/#440): delete the second copy, don't sync it.
    const roles = playerStatRoles({
      posPrimary: r.posPrimary,
      assignedPosition: r.assignedPosition,
      isTwoWay: r.isTwoWay,
    });
    if (roles.countPitching) {
      a.W += ps.W; a.SV += ps.SV; a.K += ps.K;
      a.ER += ps.ER; a.IP += ps.IP; a.BB_H += ps.BB_H;
    }
    if (roles.countHitting) {
      a.R += ps.R; a.HR += ps.HR; a.RBI += ps.RBI;
      a.SB += ps.SB; a.H += ps.H; a.AB += ps.AB;
    }
  }

  return acc;
}

/**
 * Roster stints that computeTeamPeriodTotals WOULD count, but which have no
 * PlayerStatsPeriod row for the period.
 *
 * The accumulator silently `continue`s on a missing row — from inside a pure
 * function that is indistinguishable from "genuinely zero". This is the
 * caller-side check that tells the two apart, so a coverage gap surfaces as
 * INCOMPLETE instead of quietly under-counting a team.
 *
 * It shares `isInPeriodWindow` AND the per-team dedup key with the accumulator
 * on purpose: a drop-and-re-add is one player with one missing stat line, and
 * must be reported as one skip, not two.
 */
export function findCoverageGaps(args: {
  rosters: RosterStint[];
  period: { startDate: Date; endDate: Date; name: string };
  pspByPlayer: Map<number, StatLine>;
  isOnIlAtPeriodStart: (playerId: number) => boolean;
  playerNameById: Map<number, string>;
}): { playersSkipped: number; skipReasons: string[] } {
  const { rosters, period, pspByPlayer, isOnIlAtPeriodStart, playerNameById } = args;

  let playersSkipped = 0;
  const skipReasons: string[] = [];
  const seen = new Set<string>(); // mirrors the accumulator's PR #402 guard

  for (const r of rosters) {
    if (!isInPeriodWindow({ stint: r, period, isOnIlAtPeriodStart })) continue;

    const key = `${r.teamId}:${r.playerId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!pspByPlayer.has(r.playerId)) {
      playersSkipped++;
      const name = playerNameById.get(r.playerId) ?? `playerId ${r.playerId}`;
      skipReasons.push(`[${period.name}] ${name} (teamId=${r.teamId}): no PlayerStatsPeriod row`);
    }
  }

  return { playersSkipped, skipReasons };
}
