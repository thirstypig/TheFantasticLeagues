import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { CommissionerService } from "../commissioner/services/CommissionerService.js";
import { requireAuth, requireAdmin, requireCommissionerOrAdmin, requireLeagueMember } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";

const rulesUpdateSchema = z.object({
  updates: z.array(z.object({
    id: z.number().int().positive(),
    value: z.string().max(1000),
  })).min(1).max(200),
});
const router = Router();
const commissionerService = new CommissionerService();

/**
 * GET /api/leagues/:id/rules
 * Get all rules for a league (creates defaults if none exist)
 */
router.get("/:id/rules", requireAuth, requireLeagueMember("id"), asyncHandler(async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.id);

  const rules = await commissionerService.getRules(leagueId);

  // Group by category for easier UI rendering
  const grouped = rules.reduce((acc: Record<string, typeof rules>, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {});

  res.json({ rules, grouped, leagueId });
}));

/**
 * PUT /api/leagues/:id/rules
 * Bulk update rules (admin/commissioner only)
 */
router.put("/:id/rules", requireAuth, requireCommissionerOrAdmin("id"), validateBody(rulesUpdateSchema), asyncHandler(async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.id);
  const { updates } = req.body; // Array of { id, value } objects

  const count = await commissionerService.updateRules(leagueId, updates);

  writeAuditLog({
    userId: req.user!.id,
    action: "RULES_UPDATE",
    resourceType: "LeagueRule",
    resourceId: leagueId,
    metadata: { updateCount: count },
  });

  res.json({ success: true, updated: count });
}));

/**
 * POST /api/leagues/:id/rules/lock
 * Lock all rules for the season (prevents further editing)
 */
router.post("/:id/rules/lock", requireAuth, requireCommissionerOrAdmin("id"), asyncHandler(async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.id);

  await commissionerService.lockRules(leagueId);

  res.json({ success: true, message: "Rules locked for the season" });
}));

/**
 * POST /api/leagues/:id/rules/unlock
 * Unlock rules (admin only - emergency)
 */
router.post("/:id/rules/unlock", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.id);

  await commissionerService.unlockRules(leagueId);

  res.json({ success: true, message: "Rules unlocked" });
}));

export const rulesRouter = router;
export default rulesRouter;

