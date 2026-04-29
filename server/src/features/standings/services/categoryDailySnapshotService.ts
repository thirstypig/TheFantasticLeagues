/**
 * Daily category snapshot service — Gap 2 of post-Aurora server enhancements.
 *
 * Plan: docs/plans/2026-04-28-server-enhancements-post-aurora.md
 *
 * Persists each team's per-category value + rank + rank-points once per day
 * for every active league. Powers true day-over-day deltas on
 * CategoryStandingsView (see client/src/features/periods/components/
 * CategoryStandingsView.tsx) and any future "biggest mover" features.
 *
 * Scheduled at 11:00 UTC daily (between the 12:00 UTC roster sync and
 * 13:00 UTC stats sync) so the snapshot reflects yesterday's complete
 * state before today's new stats land. Cron registration lives in
 * server/src/index.ts.
 */
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { CATEGORY_CONFIG, KEY_TO_DB_FIELD } from "../../../lib/sportConfig.js";
import { computeCategoryRows, computeTeamStatsFromDb } from "./standingsService.js";

/**
 * Snapshot every team's per-category state for one league as of the given
 * cutoff date. Idempotent — safe to re-run for the same date.
 *
 * Returns the number of (team × category) rows upserted.
 */
export async function snapshotLeagueCategoryDaily(
  leagueId: number,
  date: Date
): Promise<{ rowsWritten: number; periodId: number | null }> {
  // Resolve the active (or most recently completed) period for this league.
  // The current-period stats are what we snapshot; historical periods are
  // fixed once stat sync completes.
  const period =
    (await prisma.period.findFirst({
      where: { status: "active", leagueId },
      orderBy: { endDate: "desc" },
    })) ??
    (await prisma.period.findFirst({
      where: { status: "completed", leagueId },
      orderBy: { endDate: "desc" },
    }));

  if (!period) {
    logger.info({ leagueId }, "[categoryDaily] no period found, skipping");
    return { rowsWritten: 0, periodId: null };
  }

  const teamStats = await computeTeamStatsFromDb(leagueId, period.id);
  if (teamStats.length === 0) {
    logger.info({ leagueId, periodId: period.id }, "[categoryDaily] no teams, skipping");
    return { rowsWritten: 0, periodId: period.id };
  }

  // Build the rows we'll upsert: one per (team × category).
  const rows: Array<{
    teamId: number;
    leagueId: number;
    date: Date;
    category: string;
    value: number;
    rank: number;
    rankPoints: number;
  }> = [];

  for (const cfg of CATEGORY_CONFIG) {
    const catRows = computeCategoryRows(teamStats, cfg.key, cfg.lowerIsBetter);
    const dbField = KEY_TO_DB_FIELD[cfg.key] || cfg.key;
    for (const r of catRows) {
      // computeCategoryRows returns {teamId, value, rank, points} — we
      // re-derive value from the team-stats row to be safe (different
      // CATEGORY_CONFIG keys map to different field names; cfg.key is
      // the API contract while dbField is what's on TeamStatRow).
      const teamRow = teamStats.find((t) => t.team.id === r.teamId);
      const rawValue =
        (teamRow as unknown as Record<string, number>)?.[dbField] ?? r.value ?? 0;
      rows.push({
        teamId: r.teamId,
        leagueId,
        date,
        category: cfg.key,
        value: Number(rawValue) || 0,
        rank: r.rank,
        rankPoints: r.points,
      });
    }
  }

  // Idempotent upsert keyed on (teamId, leagueId, date, category).
  // Wrapped in a transaction so a partial failure doesn't leave the
  // league in a half-snapshotted state.
  await prisma.$transaction(
    rows.map((row) =>
      prisma.teamStatsCategoryDaily.upsert({
        where: {
          teamId_leagueId_date_category: {
            teamId: row.teamId,
            leagueId: row.leagueId,
            date: row.date,
            category: row.category,
          },
        },
        update: { value: row.value, rank: row.rank, rankPoints: row.rankPoints },
        create: row,
      })
    )
  );

  return { rowsWritten: rows.length, periodId: period.id };
}

/**
 * Snapshot every active league. Called from the daily 11:00 UTC cron.
 *
 * Runs leagues sequentially to avoid hammering the DB connection pool —
 * leagues are independent so per-league failures don't cascade.
 */
export async function snapshotAllActiveLeaguesCategoryDaily(): Promise<{
  leaguesProcessed: number;
  totalRowsWritten: number;
  errors: number;
}> {
  // Today's date — store as DATE (no time component) so multiple
  // intra-day calls upsert into the same row.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Active leagues: any league that has at least one active or
  // completed period. (Leagues stuck in SETUP have no stats yet.)
  const leagues = await prisma.league.findMany({
    where: {
      periods: { some: { status: { in: ["active", "completed"] } } },
    },
    select: { id: true, name: true },
  });

  let totalRowsWritten = 0;
  let errors = 0;
  for (const league of leagues) {
    try {
      const { rowsWritten } = await snapshotLeagueCategoryDaily(league.id, today);
      totalRowsWritten += rowsWritten;
    } catch (err) {
      errors += 1;
      logger.error(
        { leagueId: league.id, leagueName: league.name, error: String(err) },
        "[categoryDaily] league snapshot failed"
      );
    }
  }

  return { leaguesProcessed: leagues.length, totalRowsWritten, errors };
}

/**
 * Read snapshots for a league on a specific date. Returns a
 * Map<teamId, Map<categoryKey, snapshot>> for fast lookup at request time.
 */
export async function readLeagueSnapshotForDate(
  leagueId: number,
  date: Date
): Promise<Map<number, Map<string, { value: number; rank: number; rankPoints: number }>>> {
  const dateOnly = new Date(date);
  dateOnly.setUTCHours(0, 0, 0, 0);

  const snapshots = await prisma.teamStatsCategoryDaily.findMany({
    where: { leagueId, date: dateOnly },
  });

  const byTeam = new Map<
    number,
    Map<string, { value: number; rank: number; rankPoints: number }>
  >();
  for (const s of snapshots) {
    let inner = byTeam.get(s.teamId);
    if (!inner) {
      inner = new Map();
      byTeam.set(s.teamId, inner);
    }
    inner.set(s.category, { value: s.value, rank: s.rank, rankPoints: s.rankPoints });
  }
  return byTeam;
}
