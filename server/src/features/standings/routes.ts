import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
  computeCategoryRows,
  getSeasonStandings,
  CATEGORY_CONFIG,
  KEY_TO_DB_FIELD,
} from "./services/standingsService.js";
import { createScoringEngine } from "./services/scoringEngine.js";

const router = Router();

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

  res.json({ periodId: period.id, data });
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

  const teamStats = await computeTeamStatsFromDb(leagueId, pid);

  // Compute season-to-date stats
  const selectedPeriod = await prisma.period.findUnique({ where: { id: pid } });
  const allPeriods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] }, startDate: { lte: selectedPeriod?.endDate ?? new Date() } },
    orderBy: { startDate: "asc" },
  });

  const allPeriodStats = await Promise.all(
    allPeriods.map(p =>
      p.id === pid ? Promise.resolve(teamStats) : computeTeamStatsFromDb(leagueId, p.id)
    )
  );

  const seasonTotals = new Map<number, Record<string, number>>();
  for (const pStats of allPeriodStats) {
    for (const t of pStats) {
      const prev = seasonTotals.get(t.team.id) ?? { R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0, W: 0, S: 0, K: 0, ERA: 0, WHIP: 0 };
      prev.R += t.R; prev.HR += t.HR; prev.RBI += t.RBI; prev.SB += t.SB;
      prev.W += t.W; prev.S += t.S; prev.K += t.K;
      // Rate stats: accumulate for averaging (components not available in TeamStatRow)
      prev.AVG += t.AVG; prev.ERA += t.ERA; prev.WHIP += t.WHIP;
      seasonTotals.set(t.team.id, prev);
    }
  }
  const periodCount = allPeriodStats.length;
  if (periodCount > 0) {
    for (const totals of seasonTotals.values()) {
      totals.AVG /= periodCount;
      totals.ERA /= periodCount;
      totals.WHIP /= periodCount;
    }
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

  await prisma.$transaction(
    teamStats.map(t => prisma.teamStatsPeriod.upsert({
      where: { teamId_periodId: { teamId: t.team.id, periodId: pid } },
      update: { R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, S: t.S, ERA: t.ERA, WHIP: t.WHIP, K: t.K },
      create: { teamId: t.team.id, periodId: pid, R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, S: t.S, ERA: t.ERA, WHIP: t.WHIP, K: t.K },
    }))
  );

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
      (row as any).seasonValue = sTotals?.[dbField] ?? 0;
    }
    return { key: cfg.key, label: cfg.label, lowerIsBetter: cfg.lowerIsBetter, group: cfg.group, rows };
  });

  const totalDeltaMap = new Map<number, number>();
  for (const s of currentStandings) {
    const prevTotal = prevStandingsMap.get(s.teamId) ?? 0;
    totalDeltaMap.set(s.teamId, snapshots.length > 0 ? s.points - prevTotal : 0);
  }

  res.json({ periodId: pid, categories, teamCount: teamStats.length, totalDelta: Object.fromEntries(totalDeltaMap) });
}));

// --- Season (cumulative) standings: /api/standings/season ---

router.get("/season", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Shared helper parallelizes per-period DB calls via Promise.all.
  const { periodIds, periodData } = await getSeasonStandings(leagueId);

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

  res.json({ periodIds, periodNames, categoryKeys, rows, scoringFormat, h2hStandings });
}));

// --- Settlement data: /api/standings/settlement/:leagueId ---

router.get("/standings/settlement/:leagueId", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const rules = await prisma.leagueRule.findMany({
    where: { leagueId, category: "payouts" },
  });

  const ruleMap = new Map(rules.map(r => [r.key, r.value]));
  const entryFee = Number(ruleMap.get("entry_fee") || "0");
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
