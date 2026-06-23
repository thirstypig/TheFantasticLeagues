import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { validateBody } from "../../../middleware/validate.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { syncAllPlayers, syncPositionEligibility, syncAAARosters, enrichStalePlayers } from "../../players/services/mlbSyncService.js";
import { syncPeriodStats, syncAllActivePeriods, reconcilePeriodStats, reconcileRecentlyClosedPeriods } from "../../players/services/mlbStatsSyncService.js";
import { computeTeamStatsFromDb } from "../../standings/services/standingsService.js";

const router = Router();

/**
 * POST /api/admin/sync-mlb-players
 */
const syncMlbSchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
});

router.post("/admin/sync-mlb-players", requireAuth, requireAdmin, validateBody(syncMlbSchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  const result = await syncAllPlayers(season);

  writeAuditLog({
    userId: req.user!.id,
    action: "MLB_PLAYER_SYNC",
    resourceType: "Player",
    metadata: { season, created: result.created, updated: result.updated, teams: result.teams, teamChanges: result.teamChanges.length },
  });

  return res.json({ success: true, season, ...result });
}));

/**
 * POST /api/admin/sync-stats
 */
const syncStatsSchema = z.object({
  periodId: z.number().int().positive().optional(),
});

router.post("/admin/sync-stats", requireAuth, requireAdmin, validateBody(syncStatsSchema), asyncHandler(async (req, res) => {
  const periodId = req.body?.periodId ? Number(req.body.periodId) : null;

  if (periodId) {
    const result = await syncPeriodStats(periodId);

    writeAuditLog({
      userId: req.user!.id,
      action: "STATS_SYNC",
      resourceType: "Period",
      resourceId: String(periodId),
      metadata: result,
    });

    return res.json({ success: true, periodId, ...result });
  }

  await syncAllActivePeriods();

  writeAuditLog({
    userId: req.user!.id,
    action: "STATS_SYNC",
    resourceType: "Period",
    metadata: { scope: "all_active" },
  });

  return res.json({ success: true, scope: "all_active" });
}));

/**
 * POST /api/admin/reconcile-period
 */
const reconcilePeriodSchema = z.object({
  periodId: z.number().int().positive().optional(),
});

router.post("/admin/reconcile-period", requireAuth, requireAdmin, validateBody(reconcilePeriodSchema), asyncHandler(async (req, res) => {
  const periodId = req.body?.periodId ? Number(req.body.periodId) : null;

  if (periodId) {
    const report = await reconcilePeriodStats(periodId);
    writeAuditLog({
      userId: req.user!.id,
      action: "STATS_RECONCILE",
      resourceType: "Period",
      resourceId: String(periodId),
      metadata: { mismatches: report.mismatches.length, fetchErrors: report.fetchErrors },
    });
    return res.json({ success: true, ...report });
  }

  const entries = await reconcileRecentlyClosedPeriods();
  writeAuditLog({
    userId: req.user!.id,
    action: "STATS_RECONCILE",
    resourceType: "Period",
    metadata: { scope: "recently_closed", entries },
  });
  return res.json({ success: true, entries });
}));

/**
 * POST /api/admin/recompute-period-cache
 */
const recomputePeriodCacheSchema = z.object({
  periodId: z.number().int().positive(),
  leagueId: z.number().int().positive(),
});

router.post("/admin/recompute-period-cache", requireAuth, requireAdmin, validateBody(recomputePeriodCacheSchema), asyncHandler(async (req, res) => {
  const { periodId, leagueId } = req.body as { periodId: number; leagueId: number };

  const period = await prisma.period.findFirst({ where: { id: periodId, leagueId } });
  if (!period) return res.status(404).json({ error: "Period not found in this league" });

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return res.status(404).json({ error: "League not found" });

  const teamStats = await computeTeamStatsFromDb(leagueId, periodId);
  if (teamStats.length > 0) {
    // Get league's sport (default to "baseball" for backward compatibility)
    const sport = league.sport ?? "baseball";

    // Extract stat values using categoryEngine (works for any sport)
    await prisma.$transaction(
      teamStats.map(t => {
        // For now, hard-code MLB categories for the DB update
        // (Future: make teamStatsPeriod schema sport-agnostic)
        const getStatValue = (key: string): number => {
          if (t[key] !== undefined && typeof t[key] === "number") {
            return t[key] as number;
          }
          return 0;
        };

        return prisma.teamStatsPeriod.upsert({
          where: { teamId_periodId: { teamId: t.team.id, periodId } },
          update: {
            R: getStatValue("R"),
            HR: getStatValue("HR"),
            RBI: getStatValue("RBI"),
            SB: getStatValue("SB"),
            AVG: getStatValue("AVG"),
            W: getStatValue("W"),
            S: getStatValue("S"),
            ERA: getStatValue("ERA"),
            WHIP: getStatValue("WHIP"),
            K: getStatValue("K"),
          },
          create: {
            teamId: t.team.id,
            periodId,
            R: getStatValue("R"),
            HR: getStatValue("HR"),
            RBI: getStatValue("RBI"),
            SB: getStatValue("SB"),
            AVG: getStatValue("AVG"),
            W: getStatValue("W"),
            S: getStatValue("S"),
            ERA: getStatValue("ERA"),
            WHIP: getStatValue("WHIP"),
            K: getStatValue("K"),
          },
        });
      })
    );
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "PERIOD_CACHE_RECOMPUTE",
    resourceType: "Period",
    resourceId: String(periodId),
    metadata: { leagueId, periodId, teamCount: teamStats.length },
  });

  return res.json({
    success: true,
    periodId,
    leagueId,
    periodName: period.name,
    teamsUpdated: teamStats.length,
    stats: teamStats.map(t => ({ code: t.team.code, W: t.W, K: t.K, R: t.R })),
  });
}));

/**
 * POST /api/admin/sync-position-eligibility
 */
const syncEligibilitySchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
  gpThreshold: z.number().int().min(1).max(162).optional(),
});

router.post("/admin/sync-position-eligibility", requireAuth, requireAdmin, validateBody(syncEligibilitySchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();
  const gpThreshold = req.body?.gpThreshold ?? 3;

  const result = await syncPositionEligibility(season, gpThreshold);

  writeAuditLog({
    userId: req.user!.id,
    action: "POSITION_ELIGIBILITY_SYNC",
    resourceType: "Player",
    metadata: { season, gpThreshold, ...result },
  });

  return res.json({ success: true, season, gpThreshold, ...result });
}));

/**
 * POST /api/admin/sync-prospects
 */
const syncProspectsSchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
});

router.post("/admin/sync-prospects", requireAuth, requireAdmin, validateBody(syncProspectsSchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  const result = await syncAAARosters(season);

  writeAuditLog({
    userId: req.user!.id,
    action: "AAA_PROSPECT_SYNC",
    resourceType: "Player",
    metadata: { season, ...result },
  });

  return res.json({ success: true, season, ...result });
}));

/**
 * POST /api/admin/enrich-stale-players
 */
const enrichStaleSchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
});

router.post("/admin/enrich-stale-players", requireAuth, requireAdmin, validateBody(enrichStaleSchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  const result = await enrichStalePlayers(season);

  writeAuditLog({
    userId: req.user!.id,
    action: "STALE_PLAYER_ENRICHMENT",
    resourceType: "Player",
    metadata: { season, ...result },
  });

  return res.json({ success: true, season, ...result });
}));

export default router;
