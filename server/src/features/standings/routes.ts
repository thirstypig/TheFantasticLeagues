import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
  computeCategoryRows,
  CATEGORY_CONFIG,
} from "./services/standingsService.js";

const router = Router();

// --- Period standings: /api/standings/period/current ---

router.get("/period/current", requireAuth, asyncHandler(async (req, res) => {
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

// --- Period category standings: /api/period-category-standings ---

router.get("/period-category-standings", requireAuth, asyncHandler(async (req, res) => {
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

  // Compute season-to-date stats (aggregate all periods up to and including the selected one)
  const selectedPeriod = await prisma.period.findUnique({ where: { id: pid } });
  const allPeriods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] }, startDate: { lte: selectedPeriod?.endDate ?? new Date() } },
    orderBy: { startDate: "asc" },
  });
  // Sum counting stats across all periods; for rate stats, use season standings endpoint value
  const seasonTotals = new Map<number, Record<string, number>>();
  for (const p of allPeriods) {
    const pStats = p.id === pid ? teamStats : await computeTeamStatsFromDb(leagueId, p.id);
    for (const t of pStats) {
      const prev = seasonTotals.get(t.team.id) ?? { R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0, W: 0, S: 0, K: 0, ERA: 0, WHIP: 0 };
      prev.R += t.R; prev.HR += t.HR; prev.RBI += t.RBI; prev.SB += t.SB;
      prev.W += t.W; prev.S += t.S; prev.K += t.K;
      // For rate stats (AVG, ERA, WHIP), use the latest period's value as running season value
      // This is approximate — proper implementation needs H/AB/ER/IP/BB_H exposed on TeamStatRow
      prev.AVG = t.AVG; prev.ERA = t.ERA; prev.WHIP = t.WHIP;
      seasonTotals.set(t.team.id, prev);
    }
  }

  // Compute current standings
  const currentStandings = computeStandingsFromStats(teamStats);

  // Load previous snapshot from TeamStatsPeriod for delta calculation
  const snapshots = await prisma.teamStatsPeriod.findMany({
    where: { periodId: pid },
    select: { teamId: true, R: true, HR: true, RBI: true, SB: true, AVG: true, W: true, S: true, ERA: true, WHIP: true, K: true },
  });
  const snapshotMap = new Map(snapshots.map(s => [s.teamId, s]));

  // Compute previous team stats from snapshots once (reused for both total and category deltas)
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

  // Save current stats as the new snapshot (batched in one transaction)
  await prisma.$transaction(
    teamStats.map(t => prisma.teamStatsPeriod.upsert({
      where: { teamId_periodId: { teamId: t.team.id, periodId: pid } },
      update: { R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, S: t.S, ERA: t.ERA, WHIP: t.WHIP, K: t.K },
      create: { teamId: t.team.id, periodId: pid, R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, S: t.S, ERA: t.ERA, WHIP: t.WHIP, K: t.K },
    }))
  );

  // Build categories with delta from previous snapshot + season-to-date values
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
    // Add season-to-date stat value
    for (const row of rows) {
      const sTotals = seasonTotals.get(row.teamId);
      (row as any).seasonValue = sTotals?.[cfg.key] ?? 0;
    }
    return { key: cfg.key, label: cfg.label, lowerIsBetter: cfg.lowerIsBetter, group: cfg.group, rows };
  });

  // Add total delta to each team's summary
  const totalDeltaMap = new Map<number, number>();
  for (const s of currentStandings) {
    const prevTotal = prevStandingsMap.get(s.teamId) ?? 0;
    totalDeltaMap.set(s.teamId, snapshots.length > 0 ? s.points - prevTotal : 0);
  }

  res.json({ periodId: pid, categories, teamCount: teamStats.length, totalDelta: Object.fromEntries(totalDeltaMap) });
}));

// --- Season (cumulative) standings: /api/standings/season ---

router.get("/season", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Get all periods for this league's season
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    orderBy: { startDate: "asc" },
  });

  const periodIds = periods.map((p) => p.id);
  const periodNames = periods.map((p) => p.name);

  // Compute standings per period
  const periodStandings = await Promise.all(
    periodIds.map(async (pid) => {
      const teamStats = await computeTeamStatsFromDb(leagueId, pid);
      return computeStandingsFromStats(teamStats);
    })
  );

  // Build per-team rows with period point breakdowns
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });

  const rows = teams.map((t) => {
    const periodPoints = periodStandings.map((standings) => {
      const entry = standings.find((s) => s.teamId === t.id);
      return entry?.points ?? 0;
    });
    const totalPoints = periodPoints.reduce((sum, p) => sum + p, 0);

    return {
      teamId: t.id,
      teamName: t.name,
      teamCode: t.code ?? t.name.substring(0, 3).toUpperCase(),
      periodPoints,
      totalPoints,
    };
  });

  // Sort by totalPoints descending
  rows.sort((a, b) => b.totalPoints - a.totalPoints);

  res.json({ periodIds, periodNames, rows });
}));

// --- Settlement data: /api/standings/settlement/:leagueId ---

router.get("/standings/settlement/:leagueId", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  // Get payout rules
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

  // Get teams with owners
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      id: true,
      name: true,
      code: true,
      ownerUser: {
        select: {
          id: true,
          name: true,
          email: true,
          venmoHandle: true,
          zelleHandle: true,
          paypalHandle: true,
        },
      },
      ownerships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              venmoHandle: true,
              zelleHandle: true,
              paypalHandle: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const totalPot = entryFee * teams.length;

  const teamsData = teams.map(t => {
    // Combine legacy owner + multi-owner
    const owners: any[] = [];
    if (t.ownerUser) owners.push(t.ownerUser);
    for (const o of t.ownerships) {
      if (!owners.some(existing => existing.id === o.user.id)) {
        owners.push(o.user);
      }
    }
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      owners,
    };
  });

  res.json({ leagueId, entryFee, totalPot, payoutPcts, teams: teamsData });
}));

export const standingsRouter = router;
export default standingsRouter;
