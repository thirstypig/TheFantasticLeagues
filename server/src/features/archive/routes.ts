import express from 'express';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../lib/logger.js';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/auditLog.js';
import { Prisma } from '@prisma/client';
import type { HistoricalPlayerStat } from '@prisma/client';

/** Draft result entry returned to the client. */
interface DraftResultPlayer {
  id?: number;
  playerName: string;
  fullName: string;
  teamCode: string;
  position: string;
  mlbTeam: string | null;
  draftDollars: number;
  isPitcher: boolean;
  isKeeper: boolean;
}

/** Pre-draft trade entry parsed from CSV. */
interface DraftTrade {
  fromTeamName: string;
  fromTeamCode: string;
  toTeamName: string;
  toTeamCode: string;
  amount: number;
  note: string;
}

const archiveTeamUpdateSchema = z.object({
  newName: z.string().min(1).max(200),
});

const archiveStatUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  mlbId: z.string().max(20).optional(),
  mlbTeam: z.string().max(10).optional(),
  position: z.string().max(10).optional(),
  isKeeper: z.boolean().optional(),
});
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import multer from 'multer';
import { ArchiveImportService } from './services/archiveImportService.js';
import { ArchiveExportService } from './services/archiveExportService.js';
import { ArchiveStatsService, type MlbSearchPerson, type MlbSearchResponse } from './services/archiveStatsService.js';

const archiver = new ArchiveExportService();
const statsService = new ArchiveStatsService();

// Configure multer
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const upload = multer({
  dest: path.join(__dirname, '../../data/uploads/'),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Ensure upload directory exists
if (!fs.existsSync(path.join(__dirname, '../../data/uploads/'))) {
  fs.mkdirSync(path.join(__dirname, '../../data/uploads/'), { recursive: true });
}

/**
 * GET /api/archive/seasons
 * Returns all years that have archive data
 */
router.get('/archive/seasons', requireAuth, asyncHandler(async (req, res) => {
  const seasons = await prisma.historicalSeason.findMany({
    orderBy: { year: 'desc' },
    select: { year: true }
  });
  return res.json({ seasons: seasons.map(s => s.year) });
}));

/**
 * GET /api/archive/:year/standings
 * Returns the final standings for a given year
 */
router.get('/archive/:year/standings', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const season = await prisma.historicalSeason.findFirst({
    where: { year },
    include: {
      standings: {
        orderBy: { finalRank: 'asc' }
      }
    }
  });

  if (!season) {
    return res.status(404).json({ error: `No archive found for year ${year}` });
  }

  return res.json({
    year,
    standings: season.standings
  });
}));

/**
 * GET /api/archive/:year/period/:num/standings
 * Returns calculated standings for a specific period
 */
router.get('/archive/:year/period/:num/standings', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const periodNum = parseInt(req.params.num);
  if (!Number.isFinite(year) || !Number.isFinite(periodNum)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const standings = await statsService.calculatePeriodStandings(year, periodNum);
  return res.json({ year, periodNumber: periodNum, standings });
}));

/**
 * GET /api/archive/:year/periods
 * Returns list of periods for a given year
 */
router.get('/archive/:year/periods', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const season = await prisma.historicalSeason.findFirst({
    where: { year },
    include: {
      periods: {
        select: {
          id: true,
          periodNumber: true,
          startDate: true,
          endDate: true,
          _count: {
            select: { stats: true },
          },
        },
        orderBy: { periodNumber: 'asc' },
      },
    },
  });

  if (!season) {
    return res.status(404).json({ error: `No archive found for year ${year}` });
  }

  return res.json({
    year,
    seasonId: season.id,
    periods: season.periods
  });
}));

/**
 * PUT /api/archive/:year/teams/:teamCode
 * Update a historical team name (Admin only)
 */
router.put('/archive/:year/teams/:teamCode', requireAuth, requireAdmin, validateBody(archiveTeamUpdateSchema), asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const { teamCode } = req.params;
  const { newName } = req.body;

  if (!year || !teamCode || !newName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const updated = await prisma.historicalStanding.updateMany({
    where: {
      season: { year },
      teamCode: teamCode.toUpperCase()
    },
    data: {
      teamName: newName
    }
  });

  if (updated.count === 0) {
    return res.status(404).json({ error: 'Team not found for this season' });
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_TEAM_UPDATE",
    resourceType: "HistoricalStanding",
    metadata: { year, teamCode, newName },
  });

  res.json({ success: true, message: 'Team updated', count: updated.count });
}));

/**
 * GET /api/archive/:year/period/:num/stats
 * Returns all player stats for a specific period, separated by hitters and pitchers.
 */
router.get('/archive/:year/period/:num/stats', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const periodNum = parseInt(req.params.num);

  if (!Number.isFinite(year) || !Number.isFinite(periodNum)) {
    return res.status(400).json({ error: 'Invalid year or period number' });
  }

  const period = await prisma.historicalPeriod.findFirst({
    where: {
      season: { year },
      periodNumber: periodNum
    },
    include: {
      stats: {
        orderBy: { playerName: 'asc' }
      }
    }
  });

  if (!period) return res.status(404).json({ error: 'Period not found' });

  const hitters: HistoricalPlayerStat[] = [];
  const pitchers: HistoricalPlayerStat[] = [];

  for (const stat of period.stats) {
    const entry = {
      ...stat,
      GS: stat.GS,
      SO: stat.SO
    };
    if (stat.isPitcher) {
      pitchers.push(entry);
    } else {
      hitters.push(entry);
    }
  }

  return res.json({
    year,
    periodNumber: periodNum,
    periodId: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    hitters,
    pitchers,
    // For back-compat if needed:
    stats: period.stats
  });
}));

/**
 * PATCH /api/archive/stat/:id
 * Updates player metadata for a historical stat record
 */
router.patch('/archive/stat/:id', requireAuth, requireAdmin, validateBody(archiveStatUpdateSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid stat ID' });
  }

  const { fullName, mlbId, mlbTeam, position, isKeeper } = req.body;

  // Build update object with only provided fields
  const updateData: Prisma.HistoricalPlayerStatUpdateInput = {};
  if (fullName !== undefined) updateData.fullName = fullName;
  if (mlbId !== undefined) updateData.mlbId = mlbId;
  if (mlbTeam !== undefined) updateData.mlbTeam = mlbTeam;
  if (position !== undefined) updateData.position = position;
  if (isKeeper !== undefined) updateData.isKeeper = Boolean(isKeeper);

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  let updated;
  try {
    updated = await prisma.historicalPlayerStat.update({
      where: { id },
      data: updateData,
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Stat record not found' });
    }
    throw error;
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_STAT_UPDATE",
    resourceType: "HistoricalPlayerStat",
    resourceId: String(id),
    metadata: updateData,
  });

  return res.json({ success: true, stat: updated });
}));

/**
 * GET /api/archive/recalculate-all
 * Triggers recalculation for all historical years.
 */
router.post('/archive/recalculate-all', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const seasons = await prisma.historicalSeason.findMany({ select: { year: true } });
  let totalUpdated = 0;

  for (const { year } of seasons) {
    logger.info({ year }, "Recalculate all: starting year");
    const { updated } = await statsService.recalculateYear(year);
    totalUpdated += updated;
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_RECALCULATE_ALL",
    resourceType: "HistoricalSeason",
    metadata: { totalUpdated },
  });

  return res.json({ success: true, message: 'Global recalculation complete', totalUpdated });
}));

/**
 * POST /api/archive/:year/sync
 * Performs both auto-matching AND stat recalculation for a season.
 */
router.post('/archive/:year/sync', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const logs: string[] = [];
  logs.push(`[Sync] Starting auto-match for ${year}...`);
  const matchResult = await statsService.autoMatchPlayersForYear(year);
  logs.push(`[Sync] Auto-matched ${matchResult.matched} players (${matchResult.unmatched} unmatched).`);

  logs.push(`[Sync] Starting stat recalculation for ${year}...`);
  const { updated } = await statsService.recalculateYear(year, 'all', undefined, true);
  logs.push(`[Sync] Updated ${updated} player records with MLB stats.`);

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_SYNC",
    resourceType: "HistoricalSeason",
    metadata: { year, updated, matched: matchResult.matched },
  });

  return res.json({ success: true, year, updated, matchResult, logs });
}));

router.post('/archive/:year/recalculate', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const { tab, periodNumber, fetchStats = true } = req.body;
  const { updated } = await statsService.recalculateYear(year, tab, periodNumber ? parseInt(periodNumber) : undefined, fetchStats);

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_RECALCULATE",
    resourceType: "HistoricalSeason",
    metadata: { year, updated, tab, periodNumber },
  });

  return res.json({ success: true, year, updated });
}));

/**
 * GET /api/archive/search-players?query=:name
 * Search current Player table for MLB player lookup
 */
router.get('/archive/search-players', requireAuth, asyncHandler(async (req, res) => {
  const query = req.query.query as string;

  if (!query || query.trim().length < 2) {
    return res.json({ players: [] });
  }

  const players = await prisma.player.findMany({
    where: {
      name: {
        contains: query.trim(),
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      mlbId: true,
      posPrimary: true,
    },
    take: 10,
    orderBy: { name: 'asc' },
  });

  return res.json({ players });
}));

/**
 * GET /archive/search-mlb
 * Search the MLB Stats API directly for players
 */
router.get('/archive/search-mlb', requireAuth, asyncHandler(async (req, res) => {
  const query = req.query.query as string;
  if (!query || query.trim().length < 2) {
    return res.json({ players: [] });
  }

  const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';
  const url = `${MLB_API_BASE}/people/search?names=${encodeURIComponent(query.trim())}&sportId=1`;

  const response = await fetch(url);
  if (!response.ok) return res.json({ players: [] });

  const data = await response.json() as MlbSearchResponse;
  const players = (data.people || []).slice(0, 10).map((p: MlbSearchPerson) => ({
    id: p.id,
    name: p.fullName,
    mlbId: p.id,
    position: p.primaryPosition?.abbreviation || 'UT',
    team: p.currentTeam?.name || 'Free Agent',
    active: p.active,
  }));

  return res.json({ players });
}));

/**
 * GET /api/archive/:year/standings-matrix
 * Returns per-period standings for ALL periods in a single call.
 * Avoids N separate requests to /period/:num/standings.
 */
router.get('/archive/:year/standings-matrix', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const result = await statsService.calculateAllPeriodStandings(year);
  if (!result) return res.status(404).json({ error: `No archive found for year ${year}` });
  return res.json(result);
}));

/**
 * GET /api/archive/:year/period-results
 * Returns cumulative standings for all periods
 */
router.get('/archive/:year/period-results', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const result = await statsService.calculateCumulativePeriodResults(year);
  if (!result) return res.status(404).json({ error: 'Season not found' });
  return res.json(result);
}));

// POST /api/archive/auto-match-all
// Runs name auto-matching for all seasons (full name, MLB ID).
router.post('/archive/auto-match-all', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const years = await prisma.historicalSeason.findMany({ select: { year: true } });
  const results: { year: number; matched: number; unmatched: number }[] = [];
  for (const { year } of years) {
    const matchResult = await statsService.autoMatchPlayersForYear(year);
    results.push({ year, matched: matchResult.matched, unmatched: matchResult.unmatched });
  }
  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_AUTOMATCH_ALL",
    resourceType: "HistoricalSeason",
    metadata: { results },
  });

  return res.json({ success: true, results });
}));

/**
 * GET /api/archive/:year/draft-results
 * Returns auction draft results with player $ values and pre-draft trades
 */
router.get('/archive/:year/draft-results', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  // Standardized auction draft file name: draft_YYYY_auction.csv
  const draftPath = path.join(__dirname, `../../data/archive/${year}/draft_${year}_auction.csv`);
  const tradesPath = path.join(__dirname, `../../data/archive/${year}/draft_${year}_trades.csv`);

  if (!fs.existsSync(draftPath)) {
    return res.status(404).json({ error: `No draft results found for ${year}` });
  }

  const period1 = await prisma.historicalPeriod.findFirst({
    where: { season: { year }, periodNumber: 1 },
    include: {
      stats: {
        select: { id: true, playerName: true, fullName: true, mlbId: true, mlbTeam: true, teamCode: true, position: true, isKeeper: true, draftDollars: true }
      }
    }
  });

  type DraftStatLookup = Pick<HistoricalPlayerStat, 'id' | 'playerName' | 'fullName' | 'mlbId' | 'mlbTeam' | 'teamCode' | 'position' | 'isKeeper' | 'draftDollars'>;
  const playerLookup = new Map<string, DraftStatLookup>();
  if (period1?.stats) {
    for (const stat of period1.stats) {
      playerLookup.set(`${stat.playerName.toLowerCase()}_${stat.teamCode}`, stat);
    }
  }

  const trades: DraftTrade[] = [];
  if (fs.existsSync(tradesPath)) {
    const content = fs.readFileSync(tradesPath, 'utf-8');
    const lines = content.trim().split('\n').slice(1);
    for (const line of lines) {
      const [fName, fCode, tName, tCode, amt, note] = line.split(',');
      if (fCode && tCode) {
        trades.push({ fromTeamName: fName, fromTeamCode: fCode, toTeamName: tName, toTeamCode: tCode, amount: parseFloat(amt) || 0, note });
      }
    }
  }

  const draftContent = fs.readFileSync(draftPath, 'utf-8').replace(/^\uFEFF/, '');
  const draftLines = draftContent.trim().split(/\r?\n/);
  if (draftLines.length <= 1) return res.json({ year, players: [], trades });

  // Robust header detection
  const headers = draftLines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  logger.info({ headers }, "Draft headers");

  // Find columns by keyword matching
  const idxName = headers.findIndex(h => h.includes('player') && h.includes('name') || h === 'player');
  const idxTeam = headers.findIndex(h => h.includes('team') && h.includes('code') || h === 'team');
  // Pitcher column: might be "is_pitcher", "pitcher", "pos_type" etc.
  const idxPitcher = headers.findIndex(h => h.includes('pitcher') || h === 'is_pitcher');
  const idxPos = headers.findIndex(h => h === 'position' || h === 'pos');
  // Dollars: "draft_dollars", "amount", "cost", "salary"
  const idxDollars = headers.findIndex(h => h.includes('dollar') || h.includes('amount') || h.includes('cost') || h.includes('salary'));
  // Keeper: "is_keeper", "keeper"
  const idxKeeper = headers.findIndex(h => h.includes('keeper'));
  // MLB Team: "mlb_team", "mlb"
  const idxMlbTeam = headers.findIndex(h => h.includes('mlb') && h.includes('team') || h === 'mlb_team');

  logger.info({ idxName, idxTeam, idxPitcher, idxPos, idxDollars, idxKeeper, idxMlbTeam }, "Draft column indices");

  const players: DraftResultPlayer[] = [];
  for (let i = 1; i < draftLines.length; i++) {
      const line = draftLines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"/, '').replace(/"$/, ''));
          current = '';
        } else current += char;
      }
      values.push(current.trim().replace(/^"/, '').replace(/"$/, ''));

      const pName = values[idxName];
      const tCode = values[idxTeam];

      if (i < 5) logger.info({ row: i, pName, tCode }, "Draft row parsed");

      if (!pName || !tCode) continue;

      // Prioritize DB values if they exist (restored data), fallback to CSV
      const enriched = playerLookup.get(`${pName.toLowerCase()}_${tCode}`);
      const csvIsKeeper = values[idxKeeper]?.toLowerCase();

      // Keeper logic: DB > CSV > defaults
      const isKeeper = (enriched?.isKeeper)
        || (csvIsKeeper === 'true' || csvIsKeeper === 'y' || csvIsKeeper === 'yes');

      const mlbTeam = values[idxMlbTeam] || enriched?.mlbTeam || null;

      // Draft Dollars logic: DB > CSV > 0
      const csvDollars = parseInt(values[idxDollars]) || 0;
      const draftDollars = (enriched?.draftDollars && enriched.draftDollars > 0)
          ? enriched.draftDollars
          : csvDollars;

      players.push({
        id: enriched?.id,
        playerName: pName,
        fullName: enriched?.fullName || pName,
        teamCode: tCode,
        position: values[idxPos] || (values[idxPitcher]?.toLowerCase() === 'true' ? 'P' : 'UT'),
        mlbTeam: mlbTeam,
        draftDollars: draftDollars,
        isPitcher: values[idxPitcher]?.toLowerCase() === 'true',
        isKeeper: isKeeper,
      });
  }

  return res.json({ year, players, trades });
}));

// Definitions moved to top

/**
 * POST /api/archive/archive-current
 * Archives the current live season (highest year) if it has ended.
 */
router.post('/archive/archive-current', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const league = await prisma.league.findFirst({
    orderBy: { season: 'desc' }
  });

  if (!league) {
    return res.status(404).json({ error: 'No active league found for archiving' });
  }

  const result = await archiver.archiveLeague(league.id);
  if (!result.success) {
    return res.status(400).json(result);
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_CURRENT",
    resourceType: "HistoricalSeason",
    metadata: { leagueId: league.id, season: league.season },
  });

  return res.json(result);
}));


/**
 * POST /api/archive/:year/import-excel
 * Uploads an Excel file, converts it to CSVs, imports data, and auto-matches players
 */
router.post('/archive/:year/import-excel', requireAuth, requireAdmin, upload.single('file'), asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const importer = new ArchiveImportService(year);

  const result = await importer.processAndImport(filePath);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  if (!result.success) {
    logger.error({ messages: result.messages }, "Archive import failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }

  // Auto-match players after successful import
  logger.info({ year }, "Running auto-match after import");
  const matchResult = await statsService.autoMatchPlayersForYear(year);
  result.messages.push(`Auto-matched ${matchResult.matched} players (${matchResult.unmatched} unmatched)`);

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_IMPORT",
    resourceType: "HistoricalSeason",
    metadata: { year, matched: matchResult.matched, unmatched: matchResult.unmatched },
  });

  return res.json({ success: true, logs: result.messages, autoMatch: matchResult });
}));

/**
 * POST /api/archive/:year/auto-match
 * Manually trigger auto-matching of abbreviated player names to full names
 */
router.post('/archive/:year/auto-match', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  logger.info({ year }, "Manual auto-match trigger");
  const result = await statsService.autoMatchPlayersForYear(year);

  writeAuditLog({
    userId: req.user!.id,
    action: "ARCHIVE_AUTOMATCH",
    resourceType: "HistoricalSeason",
    metadata: { year, matched: result.matched, unmatched: result.unmatched },
  });

  return res.json({
    success: true,
    year,
    matched: result.matched,
    unmatched: result.unmatched,
    message: `Matched ${result.matched} players, ${result.unmatched} could not be matched automatically`
  });
}));

// ==============================
// AI Analysis Endpoints
// ==============================
import { aiAnalysisService } from '../../services/aiAnalysisService.js';

/**
 * GET /api/archive/:year/ai/trends/:teamCode
 * Get AI-generated team performance trend analysis
 */
router.get('/archive/:year/ai/trends/:teamCode', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const { teamCode } = req.params;

  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const result = await aiAnalysisService.analyzeTeamTrends(year, teamCode.toUpperCase());

  if (!result.success) {
    logger.error({ error: result.error }, `AI trends analysis failed for ${teamCode}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  return res.json({ year, teamCode: teamCode.toUpperCase(), analysis: result.analysis });
}));

/**
 * GET /api/archive/:year/ai/draft/:teamCode
 * Get AI-generated draft strategy analysis
 */
router.get('/archive/:year/ai/draft/:teamCode', requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const { teamCode } = req.params;

  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const result = await aiAnalysisService.analyzeDraft(year, teamCode.toUpperCase());

  if (!result.success) {
    logger.error({ error: result.error }, `AI draft analysis failed for ${teamCode}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  return res.json({ year, teamCode: teamCode.toUpperCase(), analysis: result.analysis });
}));

export const archiveRouter = router;
export default archiveRouter;
