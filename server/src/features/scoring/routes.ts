import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { getDefaultScoringRules } from "../../services/scoringEngine.js";

const router = Router();

/**
 * Verify user is commissioner of the league.
 */
async function requireCommissioner(leagueId: number, userId: number): Promise<boolean> {
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  return membership?.role === "COMMISSIONER";
}

/**
 * GET /api/leagues/:id/scoring-settings
 *
 * Fetch scoring settings + rules for a league.
 * If no ScoringSettings exist, return defaults.
 */
router.get(
  "/:id/scoring-settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.id);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    try {
      // Get league to check if exists and get sport
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, sport: true },
      });

      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      // Get or create ScoringSettings
      const settings = await prisma.scoringSettings.findUnique({
        where: { leagueId },
      });

      if (!settings) {
        const defaultRules = getDefaultScoringRules(league.sport);
        return res.json({
          id: null,
          leagueId,
          sport: league.sport,
          scoringType: league.sport === "NFL" ? "POINTS" : "CATEGORIES",
          rules: defaultRules,
        });
      }

      // Get rules separately
      const rules = await prisma.scoringRule.findMany({
        where: { scoringSettingsId: settings.id },
        orderBy: { sortOrder: "asc" },
      });

      res.json({
        id: settings.id,
        leagueId: settings.leagueId,
        sport: settings.sport,
        scoringType: settings.scoringType,
        rules,
      });
    } catch (err) {
      logger.error({ leagueId, err }, "Error fetching scoring settings");
      res.status(500).json({ error: "Internal server error" });
    }
  })
);

/**
 * PATCH /api/leagues/:id/scoring-settings
 *
 * Update scoring rules for a league.
 * Commissioner only.
 */
const updateScoringSettingsSchema = z.object({
  rules: z.array(
    z.object({
      id: z.number().int().optional(),
      statKey: z.string().min(1),
      label: z.string().min(1),
      pointValue: z.number(),
      isActive: z.boolean(),
      sortOrder: z.number().int().min(1),
      isCustom: z.boolean().optional(),
    })
  ),
});

router.patch(
  "/:id/scoring-settings",
  requireAuth,
  validateBody(updateScoringSettingsSchema),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.id);
    const { rules } = req.body;

    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    try {
      // Check commissioner access
      const isCommissioner = await requireCommissioner(leagueId, req.user!.id);
      if (!isCommissioner && !req.user!.isAdmin) {
        return res.status(403).json({ error: "Commissioner access required" });
      }

      // Get league
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, sport: true },
      });

      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      // Upsert ScoringSettings
      const settings = await prisma.scoringSettings.upsert({
        where: { leagueId },
        create: {
          leagueId,
          sport: league.sport,
          scoringType: league.sport === "NFL" ? "POINTS" : "CATEGORIES",
        },
        update: {},
        select: { id: true },
      });

      // Collect rule IDs to keep
      const ruleIdsToKeep = rules
        .filter((r: any) => r.id !== undefined)
        .map((r: any) => r.id as number);

      // Delete rules not in the update
      await prisma.scoringRule.deleteMany({
        where: {
          scoringSettingsId: settings.id,
          id: {
            notIn: ruleIdsToKeep,
          },
        },
      });

      // Upsert each rule
      for (const rule of rules) {
        if (rule.id) {
          // Update existing — verify ownership to prevent IDOR
          const updated = await prisma.scoringRule.updateMany({
            where: {
              id: rule.id,
              scoringSettingsId: settings.id,
            },
            data: {
              statKey: rule.statKey,
              label: rule.label,
              pointValue: rule.pointValue,
              isActive: rule.isActive,
              sortOrder: rule.sortOrder,
            },
          });

          // Verify rule belonged to this settings
          if (updated.count === 0) {
            return res.status(403).json({
              error: "Forbidden",
              detail: `Rule ${rule.id} does not belong to this league's scoring settings`,
            });
          }
        } else {
          // Create new
          await prisma.scoringRule.create({
            data: {
              scoringSettingsId: settings.id,
              statKey: rule.statKey,
              label: rule.label,
              pointValue: rule.pointValue,
              isActive: rule.isActive,
              sortOrder: rule.sortOrder,
              isCustom: rule.isCustom ?? true,
            },
          });
        }
      }

      // Fetch updated settings and rules
      const updated = await prisma.scoringSettings.findUnique({
        where: { id: settings.id },
      });

      const updatedRules = await prisma.scoringRule.findMany({
        where: { scoringSettingsId: settings.id },
        orderBy: { sortOrder: "asc" },
      });

      logger.info(
        { leagueId, rulesCount: rules.length },
        "Scoring settings updated"
      );

      res.json({
        id: updated!.id,
        leagueId: updated!.leagueId,
        sport: updated!.sport,
        scoringType: updated!.scoringType,
        rules: updatedRules,
      });
    } catch (err) {
      logger.error({ leagueId, err }, "Error updating scoring settings");
      res.status(500).json({ error: "Internal server error" });
    }
  })
);

/**
 * GET /api/leagues/:id/roster-config
 *
 * Fetch roster configuration for a league.
 * If no RosterConfig exists, return sport-appropriate defaults.
 */
router.get(
  "/:id/roster-config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.id);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    try {
      // Get league
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, sport: true },
      });

      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      // Get or create RosterConfig
      let config = await prisma.rosterConfig.findUnique({
        where: { leagueId },
      });

      // If no config exists, return defaults
      if (!config) {
        const defaults =
          league.sport === "NFL"
            ? {
                QB: 1,
                RB: 2,
                WR: 2,
                TE: 1,
                FLEX: 1,
                K: 1,
                DEF: 1,
                BN: 6,
              }
            : {
                PG: 1,
                SG: 1,
                SF: 1,
                PF: 1,
                C: 1,
                G: 1,
                F: 1,
                UTIL: 1,
                BN: 3,
              };

        return res.json({
          id: null,
          leagueId,
          sport: league.sport,
          slots: defaults,
        });
      }

      res.json({
        id: config.id,
        leagueId: config.leagueId,
        sport: config.sport,
        slots: config.slots,
      });
    } catch (err) {
      logger.error({ leagueId, err }, "Error fetching roster config");
      res.status(500).json({ error: "Internal server error" });
    }
  })
);

/**
 * PATCH /api/leagues/:id/roster-config
 *
 * Update roster slot configuration for a league.
 * Commissioner only.
 * Validates total slots are within bounds.
 */
const updateRosterConfigSchema = z.object({
  slots: z.record(z.string(), z.number().int().min(0)),
});

router.patch(
  "/:id/roster-config",
  requireAuth,
  validateBody(updateRosterConfigSchema),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.id);
    const { slots } = req.body;

    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    try {
      // Check commissioner access
      const isCommissioner = await requireCommissioner(leagueId, req.user!.id);
      if (!isCommissioner && !req.user!.isAdmin) {
        return res.status(403).json({ error: "Commissioner access required" });
      }

      // Get league
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, sport: true },
      });

      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      // Validate total slots
      const totalSlots = Object.values(slots).reduce((sum: number, count: any) => sum + (count as number), 0);
      if (totalSlots < 8) {
        return res.status(400).json({
          error: "Invalid roster configuration",
          detail: "Total roster spots must be at least 8",
        });
      }
      if (totalSlots > 25) {
        return res.status(400).json({
          error: "Invalid roster configuration",
          detail: "Total roster spots must not exceed 25",
        });
      }

      // Upsert RosterConfig
      const updated = await prisma.rosterConfig.upsert({
        where: { leagueId },
        create: {
          leagueId,
          sport: league.sport,
          slots: slots as any,
        },
        update: {
          slots: slots as any,
        },
      });

      logger.info(
        { leagueId, totalSlots },
        "Roster config updated"
      );

      res.json({
        id: updated.id,
        leagueId: updated.leagueId,
        sport: updated.sport,
        slots: updated.slots,
      });
    } catch (err) {
      logger.error({ leagueId, err }, "Error updating roster config");
      res.status(500).json({ error: "Internal server error" });
    }
  })
);

export const scoringRouter = router;
