// server/src/lib/rosterWindow.ts
// Effective-date handling + ownership-window overlap guard for commissioner
// backdated roster moves.
//
// Convention — windows are half-open `[acquiredAt, releasedAt)` at UTC midnight:
//   - `acquiredAt`: first day the team owns the player (inclusive)
//   - `releasedAt`: first day the team no longer owns the player (exclusive),
//                   or null if still active
//
// `nextDayEffective()` produces UTC midnight the day after PT-today, which
// matches this convention (today's stats stay with current owner, new owner
// starts tomorrow).

import { nextDayEffective } from "./utils.js";

type PrismaLike = {
  roster: {
    findMany: (args: any) => Promise<any[]>;
  };
};

/**
 * Parse an ISO date (YYYY-MM-DD) or ISO datetime override into a Date anchored
 * at UTC midnight of that calendar day. Returns null for null/undefined/empty.
 *
 * Date-only strings are interpreted as UTC midnight to match the rest of the
 * roster/stats pipeline (`PlayerStatsDaily.gameDate` is stored as `@db.Date`
 * which round-trips as `YYYY-MM-DDT00:00:00Z`).
 */
export function parseEffectiveDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Date-only (YYYY-MM-DD) — anchor at UTC midnight
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid effectiveDate: ${s}`);
    return d;
  }

  // Full ISO — parse as-is, then normalize to UTC midnight of that day
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid effectiveDate: ${s}`);
  // Truncate to UTC midnight of the same calendar day
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/**
 * Resolve the effective date for a roster transition. If override is provided,
 * parse and return it; otherwise fall back to `nextDayEffective()`.
 */
export function resolveEffectiveDate(override: string | null | undefined): Date {
  const parsed = parseEffectiveDate(override);
  return parsed ?? nextDayEffective();
}

/**
 * Throw if the new ownership window `[acquiredAt, releasedAt)` overlaps any
 * existing Roster window for the same player in the same league (excluding
 * roster ids in `excludeRosterIds`).
 *
 * A null `releasedAt` on either side means open-ended (treated as +∞).
 *
 * Half-open overlap: two windows [a1, r1) and [a2, r2) overlap iff
 *   a1 < r2 AND a2 < r1
 * (with r=null treated as +∞, so the constraint collapses accordingly).
 */
export async function assertNoOwnershipConflict(
  tx: PrismaLike,
  params: {
    leagueId: number;
    playerId: number;
    acquiredAt: Date;
    releasedAt: Date | null;
    excludeRosterIds?: number[];
  },
): Promise<void> {
  const { leagueId, playerId, acquiredAt, releasedAt, excludeRosterIds = [] } = params;

  // Overlap conditions translated to Prisma:
  //   (A.releasedAt IS NULL OR A.releasedAt > newAcquiredAt)   -- existing hasn't ended before new starts
  //   AND (newReleasedAt IS NULL OR A.acquiredAt < newReleasedAt) -- existing started before new ends
  const andClauses: any[] = [
    {
      OR: [
        { releasedAt: null },
        { releasedAt: { gt: acquiredAt } },
      ],
    },
  ];
  if (releasedAt !== null) {
    andClauses.push({ acquiredAt: { lt: releasedAt } });
  }

  const conflicts = await tx.roster.findMany({
    where: {
      playerId,
      team: { leagueId },
      id: excludeRosterIds.length > 0 ? { notIn: excludeRosterIds } : undefined,
      AND: andClauses,
    },
    select: {
      id: true,
      teamId: true,
      acquiredAt: true,
      releasedAt: true,
      team: { select: { name: true } },
      player: { select: { name: true } },
    },
  });

  if (conflicts.length === 0) return;

  const c = conflicts[0];
  const name = c.player?.name ?? `Player #${playerId}`;
  const team = c.team?.name ?? `Team #${c.teamId}`;
  const existingWindow = c.releasedAt
    ? `${c.acquiredAt.toISOString().slice(0, 10)} → ${c.releasedAt.toISOString().slice(0, 10)}`
    : `${c.acquiredAt.toISOString().slice(0, 10)} → active`;
  const newWindow = releasedAt
    ? `${acquiredAt.toISOString().slice(0, 10)} → ${releasedAt.toISOString().slice(0, 10)}`
    : `${acquiredAt.toISOString().slice(0, 10)} → active`;
  throw new Error(
    `Ownership conflict: ${name} would be on ${team} ${existingWindow} AND the new window ${newWindow}. ` +
      `Release from ${team} first (or include a drop in the same request).`,
  );
}

// ─── Stats-attribution predicates ──────────────────────────────────────────
//
// Three "was the player on this roster at this time?" questions arise in the
// standings pipeline. Each has subtly different boundary semantics — naming
// them prevents silent divergence as the code evolves.
//
// Companion: lib/ilWindows.ts (IL-stash exclusion predicate)
// Reference: docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md

export interface PeriodWindow {
  startDate: Date;
  endDate: Date;
}

/**
 * Reference spec for the `roster.findMany` WHERE clause in standingsService.ts.
 * Do NOT use for JS-side filtering of already-hydrated rows — push the filter to Prisma instead.
 *
 * SQL equivalent:
 *   acquiredAt <= endDate
 *   AND (releasedAt IS NULL OR releasedAt >= startDate)
 *
 * Inclusive on both sides — a player acquired on the last day of a period
 * or released on the first day both count as overlapping.
 *
 * @internal
 */
export function overlapsPeriod(
  roster: { acquiredAt: Date; releasedAt: Date | null },
  period: PeriodWindow,
): boolean {
  return (
    roster.acquiredAt <= period.endDate &&
    (roster.releasedAt === null || roster.releasedAt >= period.startDate)
  );
}

/**
 * True if this roster entry owned the player on `date`.
 *
 *   acquiredAt <= date AND (releasedAt IS NULL OR releasedAt > date)
 *
 * Strict upper bound: a player released exactly on `date` is NOT counted as
 * owned on that date. This is the end-of-period attribution rule used by
 * `computeWithPeriodStats` to assign a full-period PSP row to one team.
 */
export function ownedOn(
  roster: { acquiredAt: Date; releasedAt: Date | null },
  date: Date,
): boolean {
  return (
    roster.acquiredAt <= date &&
    (roster.releasedAt === null || roster.releasedAt > date)
  );
}

/**
 * Returns the [from, to] date window clamped to the period boundaries.
 * Used by `computeWithDailyStats` to decide which daily-stat rows belong to
 * this roster entry's stint.
 *
 *   from = max(acquiredAt, period.startDate)
 *   to   = min(releasedAt ?? period.endDate, period.endDate)
 */
export function clampToPeriod(
  roster: { acquiredAt: Date; releasedAt: Date | null },
  period: PeriodWindow,
): { from: Date; to: Date } {
  const from = roster.acquiredAt > period.startDate ? roster.acquiredAt : period.startDate;
  const to =
    roster.releasedAt !== null && roster.releasedAt < period.endDate
      ? roster.releasedAt
      : period.endDate;
  return { from, to };
}
