// server/src/routes/keeperPrep.ts
// Keeper Selection Agent — Pre-Auction Preparation Routes

import { Router } from "express";
import { z } from "zod";
import { KeeperPrepService } from "./services/keeperPrepService.js";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";

const keeperPrepSaveSchema = z.object({
  teamId: z.number().int().positive(),
  keeperIds: z.array(z.number().int().positive()),
  force: z.boolean().optional(),
});

const router = Router();
const keeperPrepService = new KeeperPrepService();

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

    return res.json({ team, roster, keeperLimit, isLocked });
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
    await keeperPrepService.lockKeepers(leagueId);

    writeAuditLog({
      userId: req.user!.id,
      action: "KEEPER_LOCK",
      resourceType: "KeeperPrep",
      metadata: { leagueId },
    });

    return res.json({ success: true, locked: true });
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

export const keeperPrepRouter = router;
export default keeperPrepRouter;
