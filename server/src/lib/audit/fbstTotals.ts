// server/src/lib/audit/fbstTotals.ts
import { emptyStatLine, type StatLine } from "./types.js";
import { playerStatRoles } from "../sportConfig.js";
import { clampToPeriod } from "../rosterWindow.js";

/** playerId -> (UTC-midnight ms of the game date) -> that day's line. */
export type DailyByPlayer = Map<number, Map<number, StatLine>>;

/**
 * Players whose ownership CHANGED strictly inside the period — the set
 * production routes through daily stats (todo #286 hybrid, ADR-013).
 *
 * THE SINGLE DEFINITION, for the same reason `isInPeriodWindow` is: the
 * accumulator uses it to decide which source to read, and `findCoverageGaps`
 * uses it to decide which source's absence is a gap. If they disagree, a
 * player counted from dailies gets reported missing for lacking a PSP row —
 * or worse, a genuinely missing line is never reported at all.
 *
 * Keyed per PLAYER, not per row: a drop-and-re-add is two rows for one player,
 * and splitting one player across both paths would double-credit him. Mirrors
 * `standingsService`'s `midPeriodPlayerIds` exactly.
 */
export function findMidPeriodPlayers(
  rosters: Pick<RosterStint, "playerId" | "acquiredAt" | "releasedAt">[],
  period: { startDate: Date; endDate: Date },
): Set<number> {
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const startDay = utcDay(period.startDate);
  const endDay = utcDay(period.endDate);
  const strictlyInside = (d: Date) => utcDay(d) > startDay && utcDay(d) < endDay;
  return new Set(
    rosters
      .filter((r) => strictlyInside(r.acquiredAt) || (r.releasedAt !== null && strictlyInside(r.releasedAt)))
      .map((r) => r.playerId),
  );
}

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
  /**
   * Daily lines for players who moved mid-period (todo #308). Omit and those
   * players fall back to whole-period PSP — which is the double-count this
   * parameter exists to remove, so callers auditing real data must pass it.
   */
  dailyByPlayer?: DailyByPlayer;
}): Map<number, StatLine> {
  const { teams, rosters, pspByPlayer, period, isOnIlAtPeriodStart, dailyByPlayer } = args;

  const acc = new Map<number, StatLine>(teams.map((t) => [t.id, emptyStatLine()]));
  const counted = new Set<string>(); // `${teamId}:${playerId}` — the PR #402 guard
  const midPeriod = dailyByPlayer ? findMidPeriodPlayers(rosters, period) : new Set<number>();

  const addLine = (a: StatLine, ps: StatLine, roles: { countHitting: boolean; countPitching: boolean }) => {
    if (roles.countPitching) {
      a.W += ps.W; a.SV += ps.SV; a.K += ps.K;
      a.ER += ps.ER; a.IP += ps.IP; a.BB_H += ps.BB_H;
    }
    if (roles.countHitting) {
      a.R += ps.R; a.HR += ps.HR; a.RBI += ps.RBI;
      a.SB += ps.SB; a.H += ps.H; a.AB += ps.AB;
    }
  };

  for (const r of rosters) {
    if (!isInPeriodWindow({ stint: r, period, isOnIlAtPeriodStart })) continue;

    const a = acc.get(r.teamId);
    if (!a) continue;

    const roles = playerStatRoles({
      posPrimary: r.posPrimary,
      assignedPosition: r.assignedPosition,
      isTwoWay: r.isTwoWay,
    });

    // ── Daily path: this player's ownership changed inside the period ──
    //
    // `isInPeriodWindow` is binary and `counted` is keyed per TEAM, so without
    // this a traded player earned his whole period line from BOTH teams (prod
    // Trade 22, 2026-08-30). Clamp to each stint's ownership days instead —
    // exactly what production does. No dedup here on purpose: a player's
    // stints are disjoint windows, so each one contributes its own days.
    if (dailyByPlayer && midPeriod.has(r.playerId)) {
      const perDay = dailyByPlayer.get(r.playerId);
      if (!perDay) continue;
      const { from, to } = clampToPeriod(r, period);
      for (const [ms, ds] of perDay) {
        const d = new Date(ms);
        // releasedAt is EXCLUSIVE (half-open): the release day belongs to the
        // next owner, never the dropper. Mirrors standingsService (todo #286).
        if (d >= from && d <= to && (r.releasedAt === null || d < r.releasedAt)) {
          addLine(a, ds, roles);
        }
      }
      continue;
    }

    // ── PSP path: boundary-aligned player. PSP is authoritative because
    //    playerStatsDaily collapses doubleheaders.
    const key = `${r.teamId}:${r.playerId}`;
    if (counted.has(key)) continue;

    const ps = pspByPlayer.get(r.playerId);
    if (!ps) continue;

    counted.add(key);

    addLine(a, ps, roles);
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
  /**
   * Same map the accumulator gets. Pass it whenever the accumulator gets it:
   * a mid-period player is now counted from DAILY rows, so his missing PSP row
   * is not a gap — but missing daily rows are (todo #308).
   */
  dailyByPlayer?: DailyByPlayer;
}): { playersSkipped: number; skipReasons: string[] } {
  const { rosters, period, pspByPlayer, isOnIlAtPeriodStart, playerNameById, dailyByPlayer } = args;

  let playersSkipped = 0;
  const skipReasons: string[] = [];
  const seen = new Set<string>(); // mirrors the accumulator's PR #402 guard
  // Must match the accumulator's routing exactly — see findMidPeriodPlayers.
  const midPeriod = dailyByPlayer ? findMidPeriodPlayers(rosters, period) : new Set<number>();

  for (const r of rosters) {
    if (!isInPeriodWindow({ stint: r, period, isOnIlAtPeriodStart })) continue;

    const key = `${r.teamId}:${r.playerId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // A mid-period player is read from dailies; absence THERE is the gap.
    if (dailyByPlayer && midPeriod.has(r.playerId)) {
      if (!dailyByPlayer.has(r.playerId)) {
        playersSkipped++;
        const nm = playerNameById.get(r.playerId) ?? `playerId ${r.playerId}`;
        skipReasons.push(`${nm} — no PlayerStatsDaily rows in ${period.name} (moved mid-period)`);
      }
      continue;
    }

    if (!pspByPlayer.has(r.playerId)) {
      playersSkipped++;
      const name = playerNameById.get(r.playerId) ?? `playerId ${r.playerId}`;
      skipReasons.push(`[${period.name}] ${name} (teamId=${r.teamId}): no PlayerStatsPeriod row`);
    }
  }

  return { playersSkipped, skipReasons };
}
