import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { DataService } from "../players/services/dataService.js";
import { prisma } from "../../db/prisma.js";

const router = Router();

import {
  CATEGORY_CONFIG,
  computeCategoryRows,
  computeStandingsFromStats,
  aggregatePeriodStatsFromCsv,
  aggregateSeasonStatsFromCsv,
  type CsvPlayerRow,
  type CategoryKey,
  type TeamStatRow,
  type StandingsRow,
  type SeasonStandingsRow,
} from "./services/standingsService.js";

/** Build zero-stat TeamStatRow[] for teams in a league (no CSV data yet) */
async function getDbTeamStats(leagueId: number): Promise<TeamStatRow[]> {
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });
  return teams.map((t) => ({
    team: { id: t.id, name: t.name, code: t.code ?? t.name.substring(0, 3).toUpperCase() },
    R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0,
    W: 0, S: 0, ERA: 0, WHIP: 0, K: 0,
  }));
}

/** Get CSV rows typed as CsvPlayerRow (runtime fields beyond PeriodStatRow) */
function getCsvRows(): CsvPlayerRow[] {
  return DataService.getInstance().getPeriodStats() as CsvPlayerRow[];
}

/** Get unique sorted period keys from CSV data */
function getPeriodKeys(csvRows: CsvPlayerRow[]): string[] {
  return [...new Set(
    csvRows.map((r) => String(r.period_id ?? "").trim().toUpperCase())
  )].filter(Boolean).sort();
}

// --- Period standings: /api/standings/period/current ---

router.get("/period/current", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

  if (leagueId && leagueId !== 1) {
    const stats = await getDbTeamStats(leagueId);
    const standings = computeStandingsFromStats(stats);
    return res.json({ periodId: 1, data: standings });
  }

  const ds = DataService.getInstance();
  const csvRows = getCsvRows();
  const periodKeys = getPeriodKeys(csvRows);

  const currentPeriodKey = periodKeys[periodKeys.length - 1] || "P1";
  const pidMatch = currentPeriodKey.match(/(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : 1;

  const standings = ds.getCachedStandings<StandingsRow[]>(
    `period:${currentPeriodKey}`,
    () => {
      const stats = aggregatePeriodStatsFromCsv(csvRows, currentPeriodKey);
      return computeStandingsFromStats(stats);
    }
  );

  if (standings.length === 0) {
    return res.status(404).json({ error: "No period data available" });
  }

  res.json({ periodId: pid, data: standings });
}));

// --- Period category standings: /api/period-category-standings ---

router.get("/period-category-standings", requireAuth, asyncHandler(async (req, res) => {
    const periodIdRaw = req.query.periodId ? String(req.query.periodId) : "1";
    const m = periodIdRaw.match(/(\d+)/);
    const pid = m ? parseInt(m[1], 10) : 1;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

    if (leagueId && leagueId !== 1) {
      const stats = await getDbTeamStats(leagueId);
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
      return res.json({ periodId: pid, categories, teamCount });
    }

    const periodKey = `P${pid}`;
    const ds = DataService.getInstance();
    const csvRows = getCsvRows();

    const categories = ds.getCachedStandings(
      `categories:${periodKey}`,
      () => {
        const stats = aggregatePeriodStatsFromCsv(csvRows, periodKey);
        if (stats.length === 0) return null;

        return CATEGORY_CONFIG.map((cfg) => {
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
      }
    );

    if (!categories) {
      return res.status(404).json({ error: `No data for period ${periodKey}` });
    }

    const teamCount = categories[0]?.rows.length ?? 0;
    res.json({ periodId: pid, categories, teamCount });
}));

// --- Season (cumulative) standings: /api/standings/season ---

router.get("/season", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

  if (leagueId && leagueId !== 1) {
    const stats = await getDbTeamStats(leagueId);
    const rows: SeasonStandingsRow[] = stats.map((s) => ({
      teamId: s.team.id,
      teamName: s.team.name,
      teamCode: s.team.code,
      periodPoints: [],
      totalPoints: 0,
    }));
    return res.json({ periodIds: [], rows });
  }

  const ds = DataService.getInstance();
  const csvRows = getCsvRows();
  const periodKeys = getPeriodKeys(csvRows);

  if (periodKeys.length === 0) {
    return res.json({ periodIds: [], rows: [] });
  }

  const periodIds = periodKeys.map((k) => {
    const m = k.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }).filter(Boolean);

  const rows = ds.getCachedStandings<SeasonStandingsRow[]>(
    "season",
    () => {
      // Compute standings per period
      const periodStandings = new Map<string, Map<string, number>>();
      for (const pk of periodKeys) {
        const stats = aggregatePeriodStatsFromCsv(csvRows, pk);
        const standings = computeStandingsFromStats(stats);
        const pointsMap = new Map<string, number>();
        for (const s of standings) {
          pointsMap.set(s.teamName, s.points);
        }
        periodStandings.set(pk, pointsMap);
      }

      // Compute overall season standings (sum of all period points)
      const seasonStats = aggregateSeasonStatsFromCsv(csvRows);
      const teamNames = seasonStats.map((s) => ({
        teamId: s.team.id,
        teamName: s.team.name,
        teamCode: s.team.code,
      }));

      const result = teamNames.map((t) => {
        const periodPoints = periodKeys.map((pk) => {
          return periodStandings.get(pk)?.get(t.teamName) ?? 0;
        });
        const totalPoints = periodPoints.reduce((a, b) => a + b, 0);
        return { teamId: t.teamId, teamName: t.teamName, teamCode: t.teamCode, periodPoints, totalPoints };
      });

      result.sort((a, b) => b.totalPoints - a.totalPoints);
      return result;
    }
  );

  res.json({ periodIds, rows });
}));

export const standingsRouter = router;
export default standingsRouter;
