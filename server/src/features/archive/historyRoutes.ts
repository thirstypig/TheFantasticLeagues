/**
 * The rebuilt past-seasons archive page.
 *
 *   GET /api/archive/history          every archived season, newest first, with its champion
 *   GET /api/archive/history/:year    standings, rosters and moves for one season
 *
 * Mounted inside the archive router, after its members-only guard.
 */
import express from "express";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { buildSeasonView } from "../../lib/archive/seasonView.js";
import type { ArchiveSeasonListResponse, ArchiveSeasonResponse } from "../../../../shared/api/archiveSeason.js";
import { archiveSeasonScope } from "./archiveAccess.js";

const router = express.Router();

router.get("/archive/history", asyncHandler(async (req, res) => {
  const seasons = await prisma.historicalSeason.findMany({
    where: { ...archiveSeasonScope(req.user!), teams: { some: {} } },
    select: { year: true, teams: { select: { name: true, ownerName: true, recordedTotal: true } } },
    orderBy: { year: "desc" },
  });
  const body: ArchiveSeasonListResponse = {
    seasons: seasons.map((s) => {
      const top = s.teams.filter((t) => t.recordedTotal != null).sort((a, b) => b.recordedTotal! - a.recordedTotal!)[0];
      return { year: s.year, champion: top ? { owner: top.ownerName, teamName: top.name } : null };
    }),
  };
  res.json(body);
}));

router.get("/archive/history/:year", asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return res.status(400).json({ error: "Not a season." });
  const season = await prisma.historicalSeason.findFirst({
    where: { year, ...archiveSeasonScope(req.user!), teams: { some: {} } },
    select: { id: true, year: true, keepersFromSheet: true, periodEnds: true },
  });
  if (!season) return res.status(404).json({ error: `No archived ${year} season.` });
  const [teams, entries, matches] = await Promise.all([
    prisma.historicalTeam.findMany({
      where: { seasonId: season.id },
      select: { code: true, name: true, ownerName: true, recordedPeriodPoints: true, recordedTotal: true, note: true },
    }),
    prisma.historicalRosterEntry.findMany({
      where: { seasonId: season.id, kind: { not: "SALARIES" } },
      select: { teamCode: true, kind: true, periodNumber: true, slot: true, playerName: true, salary: true, salaryNote: true, isKeeper: true },
      orderBy: { id: "asc" },
    }),
    prisma.historicalPlayerMatch.findMany({ where: { seasonId: season.id }, select: { key: true, mlbId: true, mlbName: true } }),
  ]);
  const body: ArchiveSeasonResponse = buildSeasonView({
    year: season.year, keepersFromSheet: season.keepersFromSheet, periodEnds: season.periodEnds, teams, entries,
    matches: new Map(matches.map((m) => [m.key, { mlbId: m.mlbId, mlbName: m.mlbName }])),
  });
  res.json(body);
}));

export const archiveHistoryRouter = router;
