/**
 * The rebuilt past-seasons archive page.
 *
 *   GET /api/archive/history          every archived season, newest first, with its champion
 *   GET /api/archive/history/:year    standings, rosters and moves for one season
 *   GET /api/archive/history/:year/workbook   the commissioner's original workbook, unedited
 *
 * Mounted inside the archive router, after its members-only guard.
 */
import { createHash } from "node:crypto";
import express from "express";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { buildSeasonView } from "../../lib/archive/seasonView.js";
import type { ArchiveSeasonListResponse, ArchiveSeasonResponse } from "../../../../shared/api/archiveSeason.js";
import { archiveSeasonScope } from "./archiveAccess.js";
import { SOURCE_WORKBOOK_BUCKET, sourceWorkbookFor, workbookObjectKey } from "./sourceWorkbooks.js";

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
      const wb = sourceWorkbookFor(s.year);
      return {
        year: s.year,
        champion: top ? { owner: top.ownerName, teamName: top.name } : null,
        workbook: wb ? { fileName: wb.fileName, bytes: wb.bytes } : null,
      };
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

/** Content-Disposition that survives any file name: an ASCII fallback plus the exact UTF-8 name. */
function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

router.get("/archive/history/:year/workbook", asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return res.status(400).json({ error: "Not a season." });
  // Same visibility as the season itself: members of the franchise it belongs to.
  const season = await prisma.historicalSeason.findFirst({
    where: { year, ...archiveSeasonScope(req.user!), teams: { some: {} } },
    select: { id: true },
  });
  const wb = sourceWorkbookFor(year);
  if (!season || !wb) return res.status(404).json({ error: `No workbook for ${year}.` });

  const { data, error } = await supabaseAdmin.storage.from(SOURCE_WORKBOOK_BUCKET).download(workbookObjectKey(wb));
  if (error || !data) {
    logger.warn({ year, error: error?.message }, "archive workbook: not in storage");
    return res.status(404).json({ error: `The ${year} workbook hasn't been uploaded yet.` });
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  // Served only if it is byte-for-byte the commissioner's file.
  if (createHash("sha256").update(bytes).digest("hex") !== wb.sha256) {
    logger.error({ year, size: bytes.length }, "archive workbook: stored file doesn't match its hash");
    return res.status(500).json({ error: "That workbook didn't pass its integrity check, so it wasn't sent." });
  }
  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", attachment(wb.fileName));
  res.setHeader("Content-Length", String(bytes.length));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.end(bytes);
}));

export const archiveHistoryRouter = router;
