// server/src/lib/statsFreshness.ts
//
// Staleness classification for the scoring tables (todo #300).
//
// `PlayerStatsPeriod` / `TeamStatsPeriod` gained a nullable `syncedAt` in
// migration 20260830000000. This turns that column into an answer to the only
// question that matters operationally: *is the scoring data we are serving
// actually current?*
//
// Pure on purpose — the caller owns the query, so this is unit-testable with
// no database and can be reused by the ingestion alerting in todo #299.

/**
 * A row is stale once it has gone this long without a write. The period-stats
 * sync runs 4×/day, so 24h means "missed roughly four consecutive runs" —
 * comfortably past a transient MLB outage or one skipped cron.
 */
export const STALE_AFTER_HOURS = 24;

export interface FreshnessReport {
  total: number;
  fresh: number;
  /** Written, but longer ago than the threshold. */
  stale: number;
  /**
   * `syncedAt IS NULL` — never written since the column landed. Distinct from
   * `stale` because it is genuinely *unknown*, not measured-and-old, and the
   * two want different operator responses (backfill vs. investigate the cron).
   */
  neverSynced: number;
  /** `stale + neverSynced` — what an alert should fire on. */
  needsAttention: number;
  /** Oldest observed write, or null when nothing has ever been written. */
  oldestSyncedAt: Date | null;
}

export function classifyFreshness(
  rows: { syncedAt: Date | null }[],
  opts: { now: Date; maxAgeHours?: number },
): FreshnessReport {
  const maxAgeHours = opts.maxAgeHours ?? STALE_AFTER_HOURS;
  const cutoff = opts.now.getTime() - maxAgeHours * 3600_000;

  let fresh = 0;
  let stale = 0;
  let neverSynced = 0;
  let oldest: Date | null = null;

  for (const row of rows) {
    if (row.syncedAt === null || row.syncedAt === undefined) {
      // Never counted as fresh. Backfilling this column with now() and
      // treating these as current is precisely how a staleness alarm reports
      // all-clear on the day it ships.
      neverSynced++;
      continue;
    }
    const t = row.syncedAt.getTime();
    // Boundary-exclusive: exactly at the threshold has not yet gone stale.
    if (t < cutoff) stale++;
    else fresh++;
    if (oldest === null || t < oldest.getTime()) oldest = row.syncedAt;
  }

  return {
    total: rows.length,
    fresh,
    stale,
    neverSynced,
    needsAttention: stale + neverSynced,
    oldestSyncedAt: oldest,
  };
}

interface PrismaLike {
  period: { findFirst(args: unknown): Promise<{ id: number; name: string } | null> };
  playerStatsPeriod: { findMany(args: unknown): Promise<{ syncedAt: Date | null }[]> };
}

/**
 * The detection query todo #300 exists to enable: "is the ACTIVE period's
 * stored player-stat data current?"
 *
 * Returns null when the league has no active period (off-season / between
 * periods) — that is not a fault condition and must not alert. Wire the report
 * into the durable alerting from todo #299; on its own this only measures.
 */
export async function findActivePeriodStaleness(
  prisma: PrismaLike,
  leagueId: number,
  opts: { now?: Date; maxAgeHours?: number } = {},
): Promise<(FreshnessReport & { periodId: number; periodName: string }) | null> {
  const period = await prisma.period.findFirst({
    where: { leagueId, status: "active" },
    select: { id: true, name: true },
  });
  if (!period) return null;

  const rows = await prisma.playerStatsPeriod.findMany({
    where: { periodId: period.id },
    select: { syncedAt: true },
  });

  return {
    ...classifyFreshness(rows, { now: opts.now ?? new Date(), maxAgeHours: opts.maxAgeHours }),
    periodId: period.id,
    periodName: period.name,
  };
}
