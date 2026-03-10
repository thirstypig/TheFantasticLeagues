import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { DataService } from "../players/services/dataService.js";

const router = Router();

import {
  CATEGORY_CONFIG,
  computeCategoryRows,
  computeStandingsFromStats,
  aggregatePeriodStatsFromCsv,
  type CategoryKey,
  type SeasonStandingsRow,
  type CsvPlayerRow,
} from "./services/standingsService.js";

// --- Period standings: /api/standings/period/current ---

router.get("/period/current", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Find the latest active period
  const period = await prisma.period.findFirst({
    where: { status: "active" },
    orderBy: { endDate: "desc" },
  });

  if (!period) {
    return res.status(404).json({ error: "No active period found" });
  }

  const ds = DataService.getInstance();
  const periodStats = ds.getPeriodStats() as CsvPlayerRow[];
  const periodKey = `P${period.id}`;
  const stats = aggregatePeriodStatsFromCsv(periodStats, periodKey);
  const standings = computeStandingsFromStats(stats);

  res.json({ periodId: period.id, data: standings });
}));

// --- Period category standings: /api/period-category-standings ---

router.get("/period-category-standings", requireAuth, asyncHandler(async (req, res) => {
  const periodId = req.query.periodId ? Number(req.query.periodId) : null;
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // If no periodId provided, use the latest active period
  let pid = periodId;
  if (!pid) {
    const period = await prisma.period.findFirst({
      where: { status: "active" },
      orderBy: { endDate: "desc" },
    });
    pid = period?.id ?? null;
  }

  if (!pid) {
    return res.status(404).json({ error: "No active period found" });
  }

  const ds = DataService.getInstance();
  const periodStats = ds.getPeriodStats() as CsvPlayerRow[];
  const periodKey = `P${pid}`;
  const stats = aggregatePeriodStatsFromCsv(periodStats, periodKey);

  const categories = CATEGORY_CONFIG.map((cfg) => {
    const rows = computeCategoryRows(stats, cfg.key as CategoryKey, cfg.lowerIsBetter);
    return {
      id: cfg.key,
      key: cfg.key,
      label: cfg.label,
      group: cfg.group,
      higherIsBetter: !cfg.lowerIsBetter,
      rows,
    };
  });

  const teamCount = categories[0]?.rows.length ?? 0;
  res.json({ periodId: pid, categories, teamCount });
}));

// --- Season (cumulative) standings: /api/standings/season ---

router.get("/season", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Get all periods for this season (all active + completed)
  const periods = await prisma.period.findMany({
    where: { status: { in: ["active", "completed"] } },
    orderBy: { startDate: "asc" },
  });

  if (periods.length === 0) {
    return res.json({ periodIds: [], rows: [] });
  }

  const periodIds = periods.map((p) => p.id);

  // Compute standings per period using CSV data
  const ds = DataService.getInstance();
  const allPeriodStats = ds.getPeriodStats() as CsvPlayerRow[];

  // Map by team code since CSV uses synthetic IDs
  const periodStandings = new Map<number, Map<string, number>>(); // periodId -> teamCode -> points
  for (const period of periods) {
    const periodKey = `P${period.id}`;
    const stats = aggregatePeriodStatsFromCsv(allPeriodStats, periodKey);
    const standings = computeStandingsFromStats(stats);
    const pointsMap = new Map<string, number>();
    for (const s of standings) {
      pointsMap.set(s.teamName.trim().toUpperCase(), s.points);
    }
    periodStandings.set(period.id, pointsMap);
  }

  // Get team info
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });

  const rows: SeasonStandingsRow[] = teams.map((t) => {
    const teamKey = t.name.trim().toUpperCase();
    const periodPoints = periods.map((p) => {
      return periodStandings.get(p.id)?.get(teamKey) ?? 0;
    });
    const totalPoints = periodPoints.reduce((a, b) => a + b, 0);
    return {
      teamId: t.id,
      teamName: t.name,
      teamCode: t.code ?? t.name.substring(0, 3).toUpperCase(),
      periodPoints,
      totalPoints,
    };
  });

  rows.sort((a, b) => b.totalPoints - a.totalPoints);
  res.json({ periodIds, rows });
}));

export const standingsRouter = router;
export default standingsRouter;
