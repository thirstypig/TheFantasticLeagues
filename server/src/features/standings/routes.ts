import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
  computeCategoryRows,
  getSeasonStandings,
  CATEGORY_CONFIG,
  KEY_TO_DB_FIELD,
} from "./services/standingsService.js";
import { createScoringEngine } from "./services/scoringEngine.js";
import { readLeagueSnapshotForDate } from "./services/categoryDailySnapshotService.js";

const router = Router();

/**
 * Persist `TeamStatsPeriod` snapshots for the given period. Used by the
 * `/period-category-standings` endpoint to seed the "previous state" data that
 * powers points/value deltas on the next request.
 *
 * Exported for testing — production callers must invoke it as fire-and-forget
 * (`void persistTeamStatsPeriodSnapshot(...)`) so the response path doesn't
 * block on N database writes serialized by the `connection_limit=1` pool.
 */
export async function persistTeamStatsPeriodSnapshot(
  periodId: number,
  teamStats: Array<{
    team: { id: number };
    R: number; HR: number; RBI: number; SB: number; AVG: number;
    W: number; S: number; ERA: number; WHIP: number; K: number;
  }>,
): Promise<void> {
  if (teamStats.length === 0) return;
  await prisma.$transaction(
    teamStats.map(t => prisma.teamStatsPeriod.upsert({
      where: { teamId_periodId: { teamId: t.team.id, periodId } },
      update: { R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, S: t.S, ERA: t.ERA, WHIP: t.WHIP, K: t.K },
      create: { teamId: t.team.id, periodId, R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, S: t.S, ERA: t.ERA, WHIP: t.WHIP, K: t.K },
    }))
  );
}

// --- Period standings: /api/standings/period/current ---

router.get("/period/current", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const period = await prisma.period.findFirst({
    where: { status: "active", leagueId },
    orderBy: { endDate: "desc" },
  });

  if (!period) {
    return res.status(404).json({ error: "No active period found" });
  }

  const teamStats = await computeTeamStatsFromDb(leagueId, period.id);
  const standings = computeStandingsFromStats(teamStats);

  const data = standings.map((s) => ({
    teamId: s.teamId,
    teamName: s.teamName,
    teamCode: teamStats.find((t) => t.team.id === s.teamId)?.team.code ?? s.teamName.substring(0, 3).toUpperCase(),
    points: s.points,
  }));

  res.json({ periodId: period.id, data, computedAt: new Date().toISOString() });
}));

// --- Waiver priority standings: /api/standings/waiver-priority ---
// Returns the standings used by waiver processing: most recent completed period,
// or active period if no completed period exists. Matches server waiver logic.

router.get("/waiver-priority", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Prefer most recent completed period (matches waiver processing logic)
  let period = await prisma.period.findFirst({
    where: { leagueId, status: "completed" },
    orderBy: { endDate: "desc" },
  });

  // Fall back to active period if no completed period yet
  let source: "completed" | "active" = "completed";
  if (!period) {
    period = await prisma.period.findFirst({
      where: { leagueId, status: "active" },
      orderBy: { endDate: "desc" },
    });
    source = "active";
  }

  if (!period) {
    return res.json({ periodId: null, periodName: null, source: "none", data: [] });
  }

  const teamStats = await computeTeamStatsFromDb(leagueId, period.id);
  const standings = computeStandingsFromStats(teamStats);

  const data = standings.map((s) => ({
    teamId: s.teamId,
    teamName: s.teamName,
    teamCode: teamStats.find((t) => t.team.id === s.teamId)?.team.code ?? s.teamName.substring(0, 3).toUpperCase(),
    points: s.points,
  }));

  res.json({ periodId: period.id, periodName: period.name, source, data });
}));

// --- Period category standings: /api/period-category-standings ---

router.get("/period-category-standings", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const periodId = req.query.periodId ? Number(req.query.periodId) : null;

  let pid = periodId;
  if (!pid) {
    const period = await prisma.period.findFirst({
      where: { status: "active", leagueId },
      orderBy: { endDate: "desc" },
    });
    pid = period?.id ?? null;
  }

  if (!pid) {
    return res.status(404).json({ error: "No active period found" });
  }

  const seasonData = await getSeasonStandings(leagueId);
  const cachedStatsByPeriodId = new Map(
    seasonData.periodIds.map((id, i) => [id, seasonData.periodData[i].teamStats])
  );
  // Always compute live from PSP for the selected period — never short-circuit
  // through the TeamStatsPeriod cache here. The cache is the DELTA source (read
  // at line ~200 via `snapshots`), not the current-state source. Reading it here
  // created a circular self-reinforcing stale-cache bug: stale read → stale
  // write-back → stays stale forever across period close. The fire-and-forget
  // persistTeamStatsPeriodSnapshot below will update the cache with fresh values.
  const teamStats = await computeTeamStatsFromDb(leagueId, pid);

  // Compute season-to-date stats
  // Use findFirst scoped to leagueId to prevent cross-league period probing (IDOR).
  const selectedPeriod = await prisma.period.findFirst({ where: { id: pid, leagueId } });
  if (periodId && !selectedPeriod) {
    return res.status(403).json({ error: "Period not found in this league" });
  }
  const allPeriods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] }, startDate: { lte: selectedPeriod?.endDate ?? new Date() } },
    orderBy: { startDate: "asc" },
  });

  const allPeriodStats = allPeriods.map(p => cachedStatsByPeriodId.get(p.id) ?? []);

  // Season totals across all periods. Counting stats accumulate directly.
  // Rate stats (AVG/ERA/WHIP) are recomputed from accumulated components
  // (H/AB/ER/IP/BB_H) so cross-period weighting is correct — see Issue #109.
  // (Unweighted period-mean would compute .250 for .300/100AB + .200/400AB
  //  instead of the correct .220.)
  const seasonTotals = new Map<number, {
    R: number; HR: number; RBI: number; SB: number;
    W: number; S: number; K: number;
    H: number; AB: number; ER: number; IP: number; BB_H: number;
    AVG: number; ERA: number; WHIP: number;
  }>();
  for (const pStats of allPeriodStats) {
    for (const t of pStats) {
      const prev = seasonTotals.get(t.team.id) ?? {
        R: 0, HR: 0, RBI: 0, SB: 0,
        W: 0, S: 0, K: 0,
        H: 0, AB: 0, ER: 0, IP: 0, BB_H: 0,
        AVG: 0, ERA: 0, WHIP: 0,
      };
      prev.R += t.R; prev.HR += t.HR; prev.RBI += t.RBI; prev.SB += t.SB;
      prev.W += t.W; prev.S += t.S; prev.K += t.K;
      // Accumulate rate-stat components for weighted averaging.
      prev.H += t.H ?? 0;
      prev.AB += t.AB ?? 0;
      prev.ER += t.ER ?? 0;
      prev.IP += t.IP ?? 0;
      prev.BB_H += t.BB_H ?? 0;
      seasonTotals.set(t.team.id, prev);
    }
  }
  for (const totals of seasonTotals.values()) {
    // AVG = sum(H) / sum(AB).
    totals.AVG = totals.AB > 0 ? totals.H / totals.AB : 0;
    // ERA = sum(ER) * 9 / sum(IP).
    totals.ERA = totals.IP > 0 ? (totals.ER / totals.IP) * 9 : 0;
    // WHIP = sum(BB+H) / sum(IP). NB: the "BB_H" column already stores
    // walks-plus-hits-allowed (pitching), per services/standingsService.ts.
    totals.WHIP = totals.IP > 0 ? totals.BB_H / totals.IP : 0;
  }

  const currentStandings = computeStandingsFromStats(teamStats);

  const snapshots = await prisma.teamStatsPeriod.findMany({
    where: { periodId: pid },
    select: { teamId: true, R: true, HR: true, RBI: true, SB: true, AVG: true, W: true, S: true, ERA: true, WHIP: true, K: true },
  });
  const snapshotMap = new Map(snapshots.map(s => [s.teamId, s]));

  let prevStandingsMap = new Map<number, number>();
  const prevTeamStats = snapshots.length > 0
    ? teamStats.map(t => {
        const snap = snapshotMap.get(t.team.id);
        if (!snap) return t;
        return { ...t, R: snap.R, HR: snap.HR, RBI: snap.RBI, SB: snap.SB, AVG: snap.AVG, W: snap.W, S: snap.S, ERA: snap.ERA, WHIP: snap.WHIP, K: snap.K };
      })
    : null;

  if (prevTeamStats) {
    const prevStandings = computeStandingsFromStats(prevTeamStats);
    prevStandingsMap = new Map(prevStandings.map(s => [s.teamId, s.points]));
  }

  // Fire-and-forget snapshot persistence (todo #134).
  //
  // Previously this was an awaited `$transaction(map(... upsert ...))` on the
  // GET hot path. Two problems:
  //   1. GETs should not block on writes — broke HTTP caching semantics and
  //      added a serialization point on every standings page load.
  //   2. Production runs `connection_limit=1` against Supabase. The N-statement
  //      transaction held the only connection across N round trips, serializing
  //      every concurrent standings view.
  //
  // The cron (`syncAllActivePeriods` at 13:00 UTC) writes `PlayerStatsPeriod`,
  // not `TeamStatsPeriod` — so we can't simply drop the persistence. Instead we
  // dispatch the upsert after the response is already in flight. Pattern matches
  // the post-trade AI analysis fire-and-forget. If the dispatch fails the worst
  // case is the next request shows zero deltas (transient, self-healing).
  void persistTeamStatsPeriodSnapshot(pid, teamStats).catch((err: unknown) =>
    logger.warn({ err, periodId: pid, leagueId }, "Standings snapshot persist failed"),
  );

  // Day-over-day category snapshot lookup (Gap 2 from
  // docs/plans/2026-04-28-server-enhancements-post-aurora.md).
  // Defaults to compareDays=1 (yesterday's snapshot vs today's live
  // values). When the snapshot table is empty for that date the deltas
  // are simply omitted — client falls back to "—".
  const compareDays = req.query.compareDays
    ? Math.max(1, Math.min(30, Number(req.query.compareDays) || 1))
    : 1;
  const compareDate = new Date();
  compareDate.setUTCHours(0, 0, 0, 0);
  compareDate.setUTCDate(compareDate.getUTCDate() - compareDays);
  const dailySnapshotMap = await readLeagueSnapshotForDate(leagueId, compareDate);

  const categories = CATEGORY_CONFIG.map((cfg) => {
    const rows = computeCategoryRows(teamStats, cfg.key, cfg.lowerIsBetter);
    if (prevTeamStats) {
      const prevRows = computeCategoryRows(prevTeamStats, cfg.key, cfg.lowerIsBetter);
      const prevPointsMap = new Map(prevRows.map(r => [r.teamId, r.points]));
      for (const row of rows) {
        const prevPts = prevPointsMap.get(row.teamId) ?? 0;
        (row as any).pointsDelta = row.points - prevPts;
      }
    }
    const dbField = KEY_TO_DB_FIELD[cfg.key] || cfg.key;
    for (const row of rows) {
      const sTotals = seasonTotals.get(row.teamId);
      (row as any).seasonValue = (sTotals as Record<string, number> | undefined)?.[dbField] ?? 0;

      // Day-over-day raw-value delta from the persisted daily snapshot.
      // null when no snapshot exists for the compare date — client renders "—".
      const teamSnap = dailySnapshotMap.get(row.teamId);
      const prevSnap = teamSnap?.get(cfg.key);
      if (prevSnap !== undefined) {
        const valueDelta = (row.value ?? 0) - prevSnap.value;
        const valueDeltaPct = prevSnap.value > 0
          ? (valueDelta / prevSnap.value) * 100
          : 0;
        (row as any).valueDelta = valueDelta;
        (row as any).valueDeltaPct = Number(valueDeltaPct.toFixed(2));
        (row as any).rankDelta = prevSnap.rank - row.rank; // positive = improved
      }
    }
    return { key: cfg.key, label: cfg.label, lowerIsBetter: cfg.lowerIsBetter, group: cfg.group, rows };
  });

  const totalDeltaMap = new Map<number, number>();
  for (const s of currentStandings) {
    const prevTotal = prevStandingsMap.get(s.teamId) ?? 0;
    totalDeltaMap.set(s.teamId, snapshots.length > 0 ? s.points - prevTotal : 0);
  }

  res.json({ periodId: pid, categories, teamCount: teamStats.length, totalDelta: Object.fromEntries(totalDeltaMap), computedAt: new Date().toISOString() });
}));

// --- Season (cumulative) standings: /api/standings/season ---

router.get("/season", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Shared helper parallelizes per-period DB calls via Promise.all.
  const { periodIds, periodData, computedAt } = await getSeasonStandings(leagueId);

  const periods = await prisma.period.findMany({
    where: { leagueId, id: { in: periodIds } },
    select: { id: true, name: true },
    orderBy: { startDate: "asc" },
  });
  const periodNames = periods.map((p) => p.name);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });

  const categoryKeys = ["R", "HR", "RBI", "SB", "AVG", "W", "S", "K", "ERA", "WHIP"];

  const rows = teams.map((t) => {
    const periodPoints = periodData.map(({ standings }) => {
      const entry = standings.find((s) => s.teamId === t.id);
      return entry?.points ?? 0;
    });
    const totalPoints = periodPoints.reduce((sum, p) => sum + p, 0);

    const periodStatValues: Record<string, number[]> = {};
    for (const key of categoryKeys) {
      periodStatValues[key] = periodData.map(({ teamStats }) => {
        const team = teamStats.find((ts) => ts.team.id === t.id);
        return team ? (team as any)[key] ?? 0 : 0;
      });
    }

    return {
      teamId: t.id,
      teamName: t.name,
      teamCode: t.code ?? t.name.substring(0, 3).toUpperCase(),
      periodPoints,
      totalPoints,
      periodStats: periodStatValues,
    };
  });

  rows.sort((a, b) => b.totalPoints - a.totalPoints);

  // Include scoring format so client can adapt display
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { scoringFormat: true } });
  const scoringFormat = league?.scoringFormat ?? "ROTO";

  // For H2H leagues, also include W-L-T season standings from matchups
  let h2hStandings: any[] | undefined;
  if (scoringFormat !== "ROTO") {
    const engine = await createScoringEngine(leagueId);
    h2hStandings = await engine.computeSeasonStandings(leagueId);
  }

  res.json({ periodIds, periodNames, categoryKeys, rows, scoringFormat, h2hStandings, computedAt });
}));

// --- Settlement data: /api/standings/settlement/:leagueId ---

router.get("/standings/settlement/:leagueId", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  // Entry fee now lives on the League model (see docs/RULES_AUDIT.md).
  // Payout percentages still use LeagueRule rows.
  const [rules, league] = await Promise.all([
    prisma.leagueRule.findMany({ where: { leagueId, category: "payouts" } }),
    prisma.league.findUnique({ where: { id: leagueId }, select: { entryFee: true } }),
  ]);

  const ruleMap = new Map(rules.map(r => [r.key, r.value]));
  const entryFee = Number(league?.entryFee ?? 0);
  const payoutPcts: Record<string, number> = {};
  for (let i = 1; i <= 8; i++) {
    const pct = Number(ruleMap.get(`payout_${i}st`) || ruleMap.get(`payout_${i}nd`) || ruleMap.get(`payout_${i}rd`) || ruleMap.get(`payout_${i}th`) || "0");
    if (pct > 0) payoutPcts[String(i)] = pct;
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      id: true, name: true, code: true,
      ownerUser: { select: { id: true, name: true, email: true, venmoHandle: true, zelleHandle: true, paypalHandle: true } },
      ownerships: { include: { user: { select: { id: true, name: true, email: true, venmoHandle: true, zelleHandle: true, paypalHandle: true } } } },
    },
    orderBy: { id: "asc" },
  });

  const totalPot = entryFee * teams.length;

  const teamsData = teams.map(t => {
    const owners: any[] = [];
    if (t.ownerUser) owners.push(t.ownerUser);
    for (const o of t.ownerships) {
      if (!owners.some(existing => existing.id === o.user.id)) owners.push(o.user);
    }
    return { id: t.id, name: t.name, code: t.code, owners };
  });

  res.json({ leagueId, entryFee, totalPot, payoutPcts, teams: teamsData });
}));

export const standingsRouter = router;
export default standingsRouter;
