// server/src/routes/keeperPrep.ts
// Keeper Selection Agent — Pre-Auction Preparation Routes

import { Router } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { KeeperPrepService } from "./services/keeperPrepService.js";
import { PlayerValueService } from "./services/playerValueService.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { requireAuth, requireCommissionerOrAdmin, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for value file uploads
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const uploadDir = path.join(__dirname, "../../data/uploads/");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

const keeperPrepSaveSchema = z.object({
  teamId: z.number().int().positive(),
  keeperIds: z.array(z.number().int().positive()),
  force: z.boolean().optional(),
});

const router = Router();
const keeperPrepService = new KeeperPrepService();
const playerValueService = new PlayerValueService();

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/commissioner/:leagueId/keeper-prep/populate
 * Populate rosters from the prior season's last period.
 */
router.post(
  "/commissioner/:leagueId/keeper-prep/populate",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const result = await keeperPrepService.populateRostersFromPriorSeason(leagueId);

      writeAuditLog({
        userId: req.user!.id,
        action: "KEEPER_POPULATE",
        resourceType: "KeeperPrep",
        metadata: { leagueId },
      });

      return res.json({ success: true, ...result });
  })
);

/**
 * GET /api/commissioner/:leagueId/keeper-prep/status
 * Get per-team keeper readiness summary.
 */
router.get(
  "/commissioner/:leagueId/keeper-prep/status",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const statuses = await keeperPrepService.getKeeperStatus(leagueId);
    const isLocked = await keeperPrepService.isKeepersLocked(leagueId);
    return res.json({ statuses, isLocked });
  })
);

/**
 * GET /api/commissioner/:leagueId/keeper-prep/team/:teamId/roster
 * Get full roster for a team so commissioner can pick keepers.
 */
router.get(
  "/commissioner/:leagueId/keeper-prep/team/:teamId/roster",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const teamId = Number(req.params.teamId);

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.leagueId !== leagueId) return res.status(404).json({ error: "Team not found" });

    const roster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      orderBy: [{ isKeeper: "desc" }, { price: "desc" }],
      include: {
        player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } },
      },
    });

    const keeperLimit = await keeperPrepService.getKeeperLimit(leagueId);
    const isLocked = await keeperPrepService.isKeepersLocked(leagueId);

    // Enrich with projected values
    const valueMap = await playerValueService.getValueMap(leagueId);
    const enrichedRoster = roster.map((r) => ({
      ...r,
      projectedValue: r.player?.id ? (valueMap.get(r.player.id) ?? null) : null,
    }));

    return res.json({ team, roster: enrichedRoster, keeperLimit, isLocked });
  })
);

/**
 * POST /api/commissioner/:leagueId/keeper-prep/save
 * Save keeper selections for a specific team.
 * Body: { teamId: number, keeperIds: number[], force?: boolean }
 */
router.post(
  "/commissioner/:leagueId/keeper-prep/save",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(keeperPrepSaveSchema),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const { teamId, keeperIds } = req.body;

      const result = await keeperPrepService.saveKeepersForTeam(
        leagueId,
        teamId,
        keeperIds
      );

      writeAuditLog({
        userId: req.user!.id,
        action: "KEEPER_SAVE",
        resourceType: "KeeperPrep",
        metadata: { leagueId, teamId, keeperCount: keeperIds.length },
      });

      return res.json({ success: true, ...result });
  })
);

/**
 * POST /api/commissioner/:leagueId/keeper-prep/lock
 * Lock keeper selections.
 */
router.post(
  "/commissioner/:leagueId/keeper-prep/lock",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const { releasedCount } = await keeperPrepService.lockKeepers(leagueId);

    writeAuditLog({
      userId: req.user!.id,
      action: "KEEPER_LOCK",
      resourceType: "KeeperPrep",
      metadata: { leagueId, releasedCount },
    });

    return res.json({ success: true, locked: true, releasedCount });
  })
);

/**
 * POST /api/commissioner/:leagueId/keeper-prep/unlock
 * Unlock keeper selections.
 */
router.post(
  "/commissioner/:leagueId/keeper-prep/unlock",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    await keeperPrepService.unlockKeepers(leagueId);

    writeAuditLog({
      userId: req.user!.id,
      action: "KEEPER_UNLOCK",
      resourceType: "KeeperPrep",
      metadata: { leagueId },
    });

    return res.json({ success: true, locked: false });
  })
);

/**
 * PATCH /api/commissioner/:leagueId/keeper-prep/roster/:rosterId/price
 * Update the keeper price for a single roster entry.
 * Body: { price: number }
 */
const updatePriceSchema = z.object({
  price: z.number().int().min(0),
});
router.patch(
  "/commissioner/:leagueId/keeper-prep/roster/:rosterId/price",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(updatePriceSchema),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const rosterId = Number(req.params.rosterId);
    const { price } = req.body;

    // Verify roster belongs to a team in this league
    const roster = await prisma.roster.findUnique({
      where: { id: rosterId },
      include: { team: { select: { leagueId: true } } },
    });
    if (!roster || roster.team.leagueId !== leagueId) {
      return res.status(404).json({ error: "Roster entry not found" });
    }

    const updated = await prisma.roster.update({
      where: { id: rosterId },
      data: { price },
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "KEEPER_PRICE_UPDATE",
      resourceType: "Roster",
      resourceId: String(rosterId),
      metadata: { leagueId, oldPrice: roster.price, newPrice: price },
    });

    return res.json({ success: true, roster: updated });
  })
);

// ─── Player Value Routes ─────────────────────────────────────────────────────

/**
 * POST /api/commissioner/:leagueId/keeper-prep/upload-values
 * Upload an Excel/CSV file of projected player values.
 */
router.post(
  "/commissioner/:leagueId/keeper-prep/upload-values",
  requireAuth,
  requireCommissionerOrAdmin(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const result = await playerValueService.importFromFile(leagueId, file.path);

      writeAuditLog({
        userId: req.user!.id,
        action: "VALUES_UPLOAD",
        resourceType: "PlayerValue",
        metadata: { leagueId, ...result },
      });

      return res.json({ success: true, ...result });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore cleanup errors
      }
    }
  })
);

/**
 * GET /api/commissioner/:leagueId/keeper-prep/values
 * Get all projected player values for a league.
 */
router.get(
  "/commissioner/:leagueId/keeper-prep/values",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const values = await playerValueService.getValues(leagueId);
    return res.json({ values });
  })
);

/**
 * DELETE /api/commissioner/:leagueId/keeper-prep/values
 * Clear all projected player values for a league.
 */
router.delete(
  "/commissioner/:leagueId/keeper-prep/values",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const count = await playerValueService.clearValues(leagueId);

    writeAuditLog({
      userId: req.user!.id,
      action: "VALUES_CLEAR",
      resourceType: "PlayerValue",
      metadata: { leagueId, cleared: count },
    });

    return res.json({ success: true, cleared: count });
  })
);

// ─── AI Keeper Recommendation ───────────────────────────────────────────────

// Cache: keyed by leagueId:teamId
const keeperRecommendCache = new Map<string, { recommendations: any[]; strategy: string }>();

/**
 * GET /api/commissioner/:leagueId/keeper-prep/ai-recommend?teamId=Y
 * AI-powered keeper selection recommendations for a team.
 */
router.get(
  "/commissioner/:leagueId/keeper-prep/ai-recommend",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const teamId = Number(req.query.teamId);
    if (!Number.isFinite(teamId)) return res.status(400).json({ error: "Missing teamId" });

    // Check cache
    const cacheKey = `${leagueId}:${teamId}`;
    const cached = keeperRecommendCache.get(cacheKey);
    if (cached) return res.json(cached);

    // Verify team belongs to league
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.leagueId !== leagueId) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Fetch roster with player details
    const roster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      include: {
        player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } },
      },
      orderBy: { price: "desc" },
    });

    // Fetch league rules for keeper limits and budget
    const rules = await prisma.leagueRule.findMany({
      where: { leagueId },
      select: { key: true, value: true },
    });
    const rulesMap = new Map(rules.map(r => [r.key, r.value]));
    const maxKeepers = Number(rulesMap.get("keeper_count") ?? "5");
    const budgetCap = Number(rulesMap.get("budget") ?? "400");

    const teamRoster = roster.map(r => ({
      playerId: r.player.id,
      playerName: r.player.name,
      position: r.player.posPrimary,
      price: r.price,
      keeperCost: r.price + 5,
      statsSummary: `$${r.price} acquisition, ${r.player.posPrimary}, ${r.player.mlbTeam ?? 'FA'}`,
    }));

    const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
    const result = await aiAnalysisService.recommendKeepers(
      teamRoster,
      { maxKeepers, budgetCap },
      team.budget,
    );

    if (!result.success) {
      logger.warn({ error: result.error, leagueId, teamId }, "Keeper recommendation failed");
      return res.status(503).json({ error: "Keeper recommendation is temporarily unavailable" });
    }

    keeperRecommendCache.set(cacheKey, result.result!);
    res.json(result.result);
  })
);

export const keeperPrepRouter = router;
export default keeperPrepRouter;
