import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { chunk, parseIP } from "../../../lib/utils.js";
import * as errorBuffer from "../../../lib/errorBuffer.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

/**
 * Sync player stats from the MLB Stats API into PlayerStatsPeriod for a given period.
 * Fetches stats by date range for all rostered players in the league.
 */
export async function syncPeriodStats(periodId: number): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error(`Period ${periodId} not found`);

  const startDate = period.startDate.toISOString().split("T")[0];
  const endDate = period.endDate.toISOString().split("T")[0];

  // Find all players who were ever rostered during this period
  // (includes released players so their stats are captured for date-aware attribution)
  const rosters = await prisma.roster.findMany({
    where: {
      OR: [
        { releasedAt: null },
        { releasedAt: { gte: period.startDate } },
      ],
      acquiredAt: { lte: period.endDate },
    },
    select: { player: { select: { id: true, mlbId: true } } },
  });

  const playerMap = new Map<number, number>(); // mlbId -> playerId
  for (const r of rosters) {
    if (r.player.mlbId) {
      playerMap.set(r.player.mlbId, r.player.id);
    }
  }

  const mlbIds = [...playerMap.keys()];
  if (mlbIds.length === 0) {
    logger.info({}, "No rostered players with mlbIds — skipping stats sync");
    return { synced: 0, skipped: 0, errors: 0 };
  }

  logger.info(
    { periodId, startDate, endDate, playerCount: mlbIds.length },
    "Starting period stats sync"
  );

  let synced = 0;

  // Shared fetch path with reconcilePeriodStats — the reconciler must compare
  // against EXACTLY what the syncer would write (single source of fetch/parse
  // semantics; see docs ADR-014).
  const fresh = await fetchFreshPeriodStats(playerMap, startDate!, endDate!);
  const skipped = fresh.skipped;
  const errors = fresh.errors;

  for (const [playerId, stats] of fresh.statsByPlayerId) {
    await prisma.playerStatsPeriod.upsert({
      where: { playerId_periodId: { playerId, periodId } },
      create: { playerId, periodId, ...stats },
      update: stats,
    });
    synced++;
  }

  // Mirror pitching stats for two-way player split entries (e.g., Ohtani Pitcher)
  // The synthetic pitcher entry (mlbId 1660271) gets no MLB API data, so we copy
  // pitching stats from the real player (mlbId 660271) to the pitcher-only entry.
  await mirrorTwoWayPitcherStats(periodId);

  logger.info({ synced, skipped, errors, periodId }, "Period stats sync complete");
  return { synced, skipped, errors };
}

/**
 * For two-way player split entries (synthetic pitcher records), copy pitching stats
 * from the real player's record. The real Ohtani (660271) has both hitting + pitching;
 * the pitcher entry (1660271) needs pitching-only stats mirrored.
 */
async function mirrorTwoWayPitcherStats(periodId: number): Promise<void> {
  // Convention: synthetic pitcher mlbId = real mlbId + 1_000_000
  const OFFSET = 1_000_000;

  // Find roster entries with synthetic mlbIds (mlbId > 1_000_000)
  const syntheticPitchers = await prisma.roster.findMany({
    where: { releasedAt: null, player: { mlbId: { gte: OFFSET } } },
    select: { player: { select: { id: true, mlbId: true } } },
  });

  for (const entry of syntheticPitchers) {
    const syntheticMlbId = entry.player.mlbId!;
    const realMlbId = syntheticMlbId - OFFSET;
    const pitcherPlayerId = entry.player.id;

    // Find the real player
    const realPlayer = await prisma.player.findFirst({
      where: { mlbId: realMlbId },
      select: { id: true },
    });
    if (!realPlayer) continue;

    // Get the real player's stats for this period
    const realStats = await prisma.playerStatsPeriod.findUnique({
      where: { playerId_periodId: { playerId: realPlayer.id, periodId } },
    });
    if (!realStats) continue;

    // Mirror pitching-only stats (zero out hitting so standings count correctly)
    const pitchingStats = {
      AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0,
      BB: 0, HBP: 0, SF: 0, TB: 0, DBL: 0, TPL: 0, SO: 0, OBP: 0, SLG: 0, OPS: 0, GS_HR: 0,
      W: realStats.W, SV: realStats.SV, K: realStats.K,
      IP: realStats.IP, ER: realStats.ER, BB_H: realStats.BB_H,
      L: realStats.L, GS: realStats.GS, K9: realStats.K9,
      BB9: realStats.BB9, HR_A: realStats.HR_A, BF: realStats.BF,
      SHO: realStats.SHO, G: realStats.G,
    };
    await prisma.playerStatsPeriod.upsert({
      where: { playerId_periodId: { playerId: pitcherPlayerId, periodId } },
      create: { playerId: pitcherPlayerId, periodId, ...pitchingStats },
      update: pitchingStats,
    });

    // Zero out pitching stats on the HITTER record to prevent double-counting.
    // The hitter record (real Ohtani) gets both hitting + pitching from MLB API sync.
    // We want pitching only on the synthetic pitcher record, hitting only on the hitter.
    await prisma.playerStatsPeriod.update({
      where: { playerId_periodId: { playerId: realPlayer.id, periodId } },
      data: { W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0, L: 0, GS: 0, K9: 0, BB9: 0, HR_A: 0, BF: 0, SHO: 0 },
    });

    logger.info(
      { realMlbId, syntheticMlbId, pitcherPlayerId, periodId, W: realStats.W, K: realStats.K, IP: Number(realStats.IP) },
      "Mirrored pitching stats for two-way player (zeroed hitter pitching)"
    );
  }
}

/**
 * Parse hitting + pitching stats from an MLB API person response.
 * Extracts both core fantasy stats and extended stats for MVP/Cy Young tracking.
 */
function parsePlayerStats(person: any) {
  const result = {
    // Core batting
    AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0,
    // Extended batting (MVP tracking)
    BB: 0, HBP: 0, SF: 0, TB: 0, DBL: 0, TPL: 0, SO: 0,
    OBP: 0, SLG: 0, OPS: 0,
    GS_HR: 0, // grand slams
    // Core pitching
    W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0,
    // Extended pitching (Cy Young tracking)
    L: 0, GS: 0, K9: 0, BB9: 0, HR_A: 0, BF: 0,
    SHO: 0, // shutouts
    // General
    G: 0,
  };

  if (!person.stats) return result;

  for (const statGroup of person.stats) {
    const groupName = statGroup.group?.displayName?.toLowerCase();
    const split = statGroup.splits?.[0]?.stat;
    if (!split) continue;

    if (groupName === "hitting") {
      // Core
      result.AB = split.atBats || 0;
      result.H = split.hits || 0;
      result.R = split.runs || 0;
      result.HR = split.homeRuns || 0;
      result.RBI = split.rbi || 0;
      result.SB = split.stolenBases || 0;
      // Extended
      result.BB = split.baseOnBalls || 0;
      result.HBP = split.hitByPitch || 0;
      result.SF = split.sacFlies || 0;
      result.TB = split.totalBases || 0;
      result.DBL = split.doubles || 0;
      result.TPL = split.triples || 0;
      result.SO = split.strikeOuts || 0;
      result.OBP = parseFloat(split.obp) || 0;
      result.SLG = parseFloat(split.slg) || 0;
      result.OPS = parseFloat(split.ops) || 0;
      result.GS_HR = split.grandSlams || 0;
      result.G = Math.max(result.G, split.gamesPlayed || 0);
    } else if (groupName === "pitching") {
      // Core
      result.W = split.wins || 0;
      result.SV = split.saves || 0;
      result.K = split.strikeOuts || 0;
      result.IP = split.inningsPitched ? parseIP(split.inningsPitched) : 0;
      result.ER = split.earnedRuns || 0;
      result.BB_H = (split.baseOnBalls || 0) + (split.hits || 0);
      // Extended
      result.L = split.losses || 0;
      result.GS = split.gamesStarted || 0;
      result.K9 = parseFloat(split.strikeoutsPer9Inn) || 0;
      result.BB9 = parseFloat(split.walksPer9Inn) || 0;
      result.HR_A = split.homeRuns || 0;
      result.BF = split.battersFaced || 0;
      result.SHO = split.shutouts || 0;
      result.G = Math.max(result.G, split.gamesPlayed || 0);
    }
  }

  return result;
}

/**
 * Sync stats for all active periods (status = "active").
 */
export async function syncAllActivePeriods(): Promise<void> {
  const periods = await prisma.period.findMany({
    where: { status: "active" },
    orderBy: { id: "asc" },
  });

  for (const period of periods) {
    try {
      await syncPeriodStats(period.id);
    } catch (err) {
      logger.error({ error: String(err), periodId: period.id }, "Failed to sync period stats");
    }
  }
}

/**
 * Sync daily stats for a single date into PlayerStatsDaily.
 * Queries all players who were rostered on that date (including recently released).
 */
export async function syncDailyStats(dateStr: string): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const targetDate = new Date(`${dateStr}T00:00:00Z`);

  // Find all players rostered on this date (active or released after this date)
  const rosters = await prisma.roster.findMany({
    where: {
      acquiredAt: { lte: targetDate },
      OR: [
        { releasedAt: null },
        { releasedAt: { gt: targetDate } },
      ],
    },
    select: { player: { select: { id: true, mlbId: true } } },
  });

  const playerMap = new Map<number, number>();
  for (const r of rosters) {
    if (r.player.mlbId) {
      playerMap.set(r.player.mlbId, r.player.id);
    }
  }

  const mlbIds = [...playerMap.keys()];
  if (mlbIds.length === 0) {
    logger.info({ dateStr }, "No rostered players for daily stats sync");
    return { synced: 0, skipped: 0, errors: 0 };
  }

  logger.info({ dateStr, playerCount: mlbIds.length }, "Starting daily stats sync");

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  const batches = chunk(mlbIds.map(String), 50);

  for (const batch of batches) {
    try {
      const ids = batch.join(",");
      const hydrate = `stats(group=[hitting,pitching],type=[byDateRange],startDate=${dateStr},endDate=${dateStr})`;
      const url = `${MLB_BASE}/people?personIds=${ids}&hydrate=${hydrate}`;
      const data = await mlbGetJson(url);
      const people: any[] = data.people || [];

      for (const person of people) {
        const mlbId = person.id;
        const playerId = playerMap.get(mlbId);
        if (!playerId) { skipped++; continue; }

        const stats = parsePlayerStats(person);

        // Skip if all zeros (off-day / no game). Include every batting AND
        // pitching counter — historically this list was incomplete and dropped
        // 0-out blown appearances where the only non-zero fields were `ER` /
        // `BB_H` (audit precedent: Matt Gage 2026-05-19 — pitched to 1 batter,
        // gave up a hit and a run, 0 outs → game was silently dropped).
        const hasStats =
          stats.AB > 0 || stats.H > 0 || stats.R > 0 || stats.HR > 0 ||
          stats.RBI > 0 || stats.SB > 0 || stats.BB > 0 ||
          stats.W > 0 || stats.SV > 0 || stats.K > 0 || stats.IP > 0 ||
          stats.ER > 0 || stats.BB_H > 0;
        if (!hasStats) { skipped++; continue; }

        await prisma.playerStatsDaily.upsert({
          where: { playerId_gameDate: { playerId, gameDate: targetDate } },
          create: { playerId, gameDate: targetDate, ...stats },
          update: stats,
        });

        synced++;
      }

      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      logger.error({ error: String(err), batch: batch.slice(0, 3) }, "Daily stats batch failed");
      errors += batch.length;
    }
  }

  // Mirror daily pitching stats for two-way player split entries
  await mirrorTwoWayDailyPitcherStats(targetDate);

  logger.info({ synced, skipped, errors, dateStr }, "Daily stats sync complete");
  return { synced, skipped, errors };
}

/**
 * Mirror daily pitching stats for two-way player synthetic pitcher entries.
 */
async function mirrorTwoWayDailyPitcherStats(gameDate: Date): Promise<void> {
  const OFFSET = 1_000_000;

  const syntheticPitchers = await prisma.roster.findMany({
    where: { releasedAt: null, player: { mlbId: { gte: OFFSET } } },
    select: { player: { select: { id: true, mlbId: true } } },
  });

  for (const entry of syntheticPitchers) {
    const realMlbId = entry.player.mlbId! - OFFSET;
    const pitcherPlayerId = entry.player.id;

    const realPlayer = await prisma.player.findFirst({
      where: { mlbId: realMlbId },
      select: { id: true },
    });
    if (!realPlayer) continue;

    const realStats = await prisma.playerStatsDaily.findUnique({
      where: { playerId_gameDate: { playerId: realPlayer.id, gameDate } },
    });
    if (!realStats || (realStats.W === 0 && realStats.SV === 0 && realStats.K === 0 && realStats.IP === 0)) continue;

    const dailyPitching = {
      AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0,
      BB: 0, HBP: 0, SF: 0, TB: 0, DBL: 0, TPL: 0, SO: 0, OBP: 0, SLG: 0, OPS: 0, GS_HR: 0,
      W: realStats.W, SV: realStats.SV, K: realStats.K,
      IP: realStats.IP, ER: realStats.ER, BB_H: realStats.BB_H,
      L: realStats.L, GS: realStats.GS, K9: realStats.K9,
      BB9: realStats.BB9, HR_A: realStats.HR_A, BF: realStats.BF,
      SHO: realStats.SHO, G: realStats.G,
    };
    await prisma.playerStatsDaily.upsert({
      where: { playerId_gameDate: { playerId: pitcherPlayerId, gameDate } },
      create: { playerId: pitcherPlayerId, gameDate, ...dailyPitching },
      update: dailyPitching,
    });

    // Zero out pitching stats on the hitter record to prevent double-counting
    await prisma.playerStatsDaily.update({
      where: { playerId_gameDate: { playerId: realPlayer.id, gameDate } },
      data: { W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0, L: 0, GS: 0, K9: 0, BB9: 0, HR_A: 0, BF: 0, SHO: 0 },
    });
  }
}

// ─── Stats integrity reconciliation (ADR-014, todo #287) ───────────────────
//
// Closed periods drift silently: a boundary edit after the last sync, a late
// MLB stat correction, or a missed sync leaves PlayerStatsPeriod diverging
// from the official record forever (precedent: P1 carried April 19's games for
// seven weeks — audit report Section 5.1). The reconciler re-fetches the SAME
// date range through the SAME fetch/parse path the syncer uses and diffs the
// result against what is stored. Any difference means the stored rows are
// stale — never "lag": closed-period stats are final everywhere.

/** Core standings-driving fields compared by the reconciler. */
const RECONCILE_INT_FIELDS = ["AB", "H", "R", "HR", "RBI", "SB", "W", "SV", "K", "ER", "BB_H"] as const;
const TWO_WAY_OFFSET = 1_000_000;

export interface PeriodReconcileMismatch {
  playerId: number;
  mlbId: number | null;
  field: string;
  stored: number;
  fresh: number;
}

export interface PeriodReconcileReport {
  periodId: number;
  playersChecked: number;
  fetchErrors: number;
  mismatches: PeriodReconcileMismatch[];
}

/**
 * Fetch fresh byDateRange stats for a set of players — the single fetch/parse
 * path shared by syncPeriodStats (which writes) and reconcilePeriodStats
 * (which diffs). Synthetic two-way ids (>= 1M) are absent from the MLB API
 * response and are handled by the mirror step / mirror transform respectively.
 */
async function fetchFreshPeriodStats(
  playerMap: Map<number, number>, // mlbId -> playerId
  startDate: string,
  endDate: string,
): Promise<{ statsByPlayerId: Map<number, ReturnType<typeof parsePlayerStats>>; skipped: number; errors: number }> {
  const statsByPlayerId = new Map<number, ReturnType<typeof parsePlayerStats>>();
  let skipped = 0;
  let errors = 0;

  const batches = chunk([...playerMap.keys()].map(String), 50);
  for (const batch of batches) {
    try {
      const ids = batch.join(",");
      const hydrate = `stats(group=[hitting,pitching],type=[byDateRange],startDate=${startDate},endDate=${endDate})`;
      const url = `${MLB_BASE}/people?personIds=${ids}&hydrate=${hydrate}`;
      const data = await mlbGetJson(url);
      const people: any[] = data.people || [];
      for (const person of people) {
        const playerId = playerMap.get(person.id);
        if (!playerId) {
          skipped++;
          continue;
        }
        statsByPlayerId.set(playerId, parsePlayerStats(person));
      }
      // Polite delay between batches
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      logger.error({ error: String(err), batch: batch.slice(0, 3) }, "Batch stats fetch failed");
      errors += batch.length;
    }
  }
  return { statsByPlayerId, skipped, errors };
}

/**
 * Re-fetch a period's stats from the MLB API and diff against the stored
 * PlayerStatsPeriod rows. Read-only — never writes. Applies the same two-way
 * split transform the syncer's mirror step applies (real row: pitching zeroed;
 * synthetic row: real pitching, hitting zeroed) so Ohtani never false-alarms.
 */
export async function reconcilePeriodStats(periodId: number): Promise<PeriodReconcileReport> {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error(`Period ${periodId} not found`);
  const startDate = period.startDate.toISOString().split("T")[0]!;
  const endDate = period.endDate.toISOString().split("T")[0]!;

  // Same roster window as syncPeriodStats — ever-rostered during the period.
  const rosters = await prisma.roster.findMany({
    where: {
      OR: [{ releasedAt: null }, { releasedAt: { gte: period.startDate } }],
      acquiredAt: { lte: period.endDate },
    },
    select: { player: { select: { id: true, mlbId: true } } },
  });
  const playerMap = new Map<number, number>(); // mlbId -> playerId
  for (const r of rosters) {
    if (r.player.mlbId) playerMap.set(r.player.mlbId, r.player.id);
  }

  const fresh = await fetchFreshPeriodStats(playerMap, startDate, endDate);

  // Expected = fresh + two-way mirror transform (in memory, mirrors mirrorTwoWayPitcherStats).
  const expected = new Map(fresh.statsByPlayerId);
  for (const [mlbId, playerId] of playerMap) {
    const syntheticPlayerId = playerMap.get(mlbId + TWO_WAY_OFFSET);
    if (!syntheticPlayerId) continue;
    const real = expected.get(playerId);
    if (!real) continue;
    expected.set(syntheticPlayerId, {
      ...real,
      AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0,
      BB: 0, HBP: 0, SF: 0, TB: 0, DBL: 0, TPL: 0, SO: 0, OBP: 0, SLG: 0, OPS: 0, GS_HR: 0,
    });
    expected.set(playerId, {
      ...real,
      W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0,
      L: 0, GS: 0, K9: 0, BB9: 0, HR_A: 0, BF: 0, SHO: 0,
    });
  }

  const stored = await prisma.playerStatsPeriod.findMany({ where: { periodId } });
  const storedByPlayerId = new Map(stored.map((s) => [s.playerId, s]));
  const mlbIdByPlayerId = new Map([...playerMap].map(([m, p]) => [p, m]));

  const mismatches: PeriodReconcileMismatch[] = [];
  for (const [playerId, exp] of expected) {
    const sto = storedByPlayerId.get(playerId);
    const mlbId = mlbIdByPlayerId.get(playerId) ?? null;
    for (const field of RECONCILE_INT_FIELDS) {
      const s = (sto?.[field] as number | undefined) ?? 0;
      const f = exp[field] as number;
      if (s !== f) mismatches.push({ playerId, mlbId, field, stored: s, fresh: f });
    }
    const sIP = (sto?.IP as number | undefined) ?? 0;
    if (Math.abs(sIP - exp.IP) > 0.05) {
      mismatches.push({ playerId, mlbId, field: "IP", stored: sIP, fresh: exp.IP });
    }
  }

  return { periodId, playersChecked: expected.size, fetchErrors: fresh.errors, mismatches };
}

export interface ReconcileSweepEntry {
  periodId: number;
  periodName: string;
  status: "clean" | "healed" | "drift" | "fetch_error";
  mismatchesBefore: number;
  mismatchesAfter: number;
}

/**
 * Reconcile recently closed periods; on drift, auto-heal by re-running
 * syncPeriodStats under the period's CURRENT boundaries, then verify. Persistent
 * drift after a re-sync means something deeper than staleness — alert loudly.
 * Runs across ALL leagues' periods (roster window is league-agnostic upstream).
 */
export async function reconcileRecentlyClosedPeriods(
  opts: { windowDays?: number; resync?: (periodId: number) => Promise<unknown> } = {},
): Promise<ReconcileSweepEntry[]> {
  const windowDays = opts.windowDays ?? 5;
  const resync = opts.resync ?? syncPeriodStats;
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const periods = await prisma.period.findMany({
    where: { status: "completed", endDate: { gte: cutoff, lte: now } },
    select: { id: true, name: true },
    orderBy: { endDate: "asc" },
  });

  const entries: ReconcileSweepEntry[] = [];
  for (const p of periods) {
    const before = await reconcilePeriodStats(p.id);
    if (before.fetchErrors > 0 && before.mismatches.length === 0) {
      entries.push({ periodId: p.id, periodName: p.name, status: "fetch_error", mismatchesBefore: 0, mismatchesAfter: 0 });
      continue;
    }
    if (before.mismatches.length === 0) {
      entries.push({ periodId: p.id, periodName: p.name, status: "clean", mismatchesBefore: 0, mismatchesAfter: 0 });
      continue;
    }

    logger.warn(
      { periodId: p.id, mismatches: before.mismatches.length, sample: before.mismatches.slice(0, 5) },
      "Stats reconcile: drift detected on closed period — re-syncing",
    );
    await resync(p.id);
    const after = await reconcilePeriodStats(p.id);

    if (after.mismatches.length === 0) {
      entries.push({ periodId: p.id, periodName: p.name, status: "healed", mismatchesBefore: before.mismatches.length, mismatchesAfter: 0 });
      logger.warn({ periodId: p.id, healed: before.mismatches.length }, "Stats reconcile: drift healed by re-sync");
    } else {
      entries.push({ periodId: p.id, periodName: p.name, status: "drift", mismatchesBefore: before.mismatches.length, mismatchesAfter: after.mismatches.length });
      const message = `Stats reconcile: PERSISTENT drift on closed period ${p.id} (${p.name}) — ${after.mismatches.length} mismatches after re-sync`;
      logger.error({ periodId: p.id, sample: after.mismatches.slice(0, 10) }, message);
      errorBuffer.push({
        ref: `ERR-recon-p${p.id}`,
        requestId: `recon-p${p.id}`,
        message,
        stack: null,
        path: "cron:stats-reconcile",
        method: "CRON",
        userId: null,
        userEmail: null,
        statusCode: 500,
        timestamp: new Date().toISOString(),
      });
    }
  }
  return entries;
}
