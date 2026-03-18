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

  const categories = CATEGORY_CONFIG.map((cfg) => ({
    key: cfg.key,
    label: cfg.label,
    lowerIsBetter: cfg.lowerIsBetter,
    rows: computeCategoryRows(teamStats, cfg.key, cfg.lowerIsBetter),
  }));

  res.json({ periodId: pid, categories, teamCount: teamStats.length });
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

  res.json({ periodIds, rows });
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
