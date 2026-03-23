// server/src/routes/admin.ts
import { Router } from "express";
import express from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { norm, mustOneOf } from "../../lib/utils.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { addMemberSchema } from "../../lib/schemas.js";
import { CommissionerService } from "../commissioner/services/CommissionerService.js";
import { syncNLPlayers, syncAllPlayers, syncPositionEligibility, syncAAARosters } from "../players/services/mlbSyncService.js";
import { syncPeriodStats, syncAllActivePeriods } from "../players/services/mlbStatsSyncService.js";

const createLeagueSchema = z.object({
  name: z.string().min(1).max(200),
  season: z.number().int().min(1900).max(2100),
  draftMode: z.enum(["AUCTION", "DRAFT"]).optional().default("AUCTION"),
  draftOrder: z.enum(["SNAKE", "LINEAR"]).optional(),
  isPublic: z.boolean().optional().default(false),
  publicSlug: z.string().max(100).optional(),
  copyFromLeagueId: z.number().int().positive().optional(),
});

const router = Router();
const commissionerService = new CommissionerService();

/**
 * POST /api/admin/league
 * Body:
 * {
 *   name: string,
 *   season: number,
 *   draftMode: "AUCTION" | "DRAFT",
 *   draftOrder?: "SNAKE" | "LINEAR",
 *   isPublic?: boolean,
 *   publicSlug?: string,
 *   copyFromLeagueId?: number
 * }
 */
router.post("/admin/league", requireAuth, requireAdmin, validateBody(createLeagueSchema), asyncHandler(async (req, res) => {
    const data = {
        name: norm(req.body?.name),
        season: Number(req.body?.season),
        draftMode: mustOneOf(norm(req.body?.draftMode || "AUCTION"), ["AUCTION", "DRAFT"], "draftMode") as "AUCTION" | "DRAFT",
        draftOrder: req.body?.draftMode === "DRAFT" ? (mustOneOf(norm(req.body?.draftOrder || "SNAKE"), ["SNAKE", "LINEAR"], "draftOrder") as "SNAKE" | "LINEAR") : undefined,
        isPublic: Boolean(req.body?.isPublic ?? false),
        publicSlug: norm(req.body?.publicSlug || ""),
        copyFromLeagueId: Number.isFinite(Number(req.body?.copyFromLeagueId)) ? Number(req.body?.copyFromLeagueId) : undefined,
        creatorUserId: req.user!.id
    };

    if (!data.name) return res.status(400).json({ error: "Missing name" });
    if (!Number.isFinite(data.season) || data.season < 1900 || data.season > 2100) {
      return res.status(400).json({ error: "Invalid season" });
    }

    const league = await commissionerService.createLeague(data);

    writeAuditLog({
      userId: req.user!.id,
      action: "LEAGUE_CREATE",
      resourceType: "League",
      resourceId: String(league.id),
      metadata: { name: league.name, season: league.season },
    });

    return res.json({ league });
}));

/**
 * POST /api/admin/league/:leagueId/members
 * Body:
 * { userId?: number, email?: string, role: "COMMISSIONER" | "OWNER" }
 */
router.post("/admin/league/:leagueId/members", requireAuth, requireAdmin, validateBody(addMemberSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

    const role = mustOneOf(norm(req.body?.role), ["COMMISSIONER", "OWNER"], "role") as
      | "COMMISSIONER"
      | "OWNER";

    const result = await commissionerService.addMember(leagueId, {
        userId: req.body?.userId ? Number(req.body.userId) : undefined,
        email: req.body?.email,
        role,
        invitedBy: req.user!.id,
    });

    if (result.status === "added" && result.membership) {
      writeAuditLog({
        userId: req.user!.id,
        action: "MEMBER_ADD",
        resourceType: "LeagueMembership",
        resourceId: String(result.membership.id),
        metadata: { leagueId, targetUserId: result.membership.userId, role },
      });
    }

    return res.json(result);
}));

/**
 * POST /api/admin/league/:leagueId/import-rosters
 * Body: Raw CSV text or multipart (simpler: pure text/csv body for now)
 */
router.post("/admin/league/:leagueId/import-rosters", requireAuth, requireAdmin, express.text({ type: ["text/csv", "text/plain"] }), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  // Expect raw body for simplicity
  const csvContent = typeof req.body === "string" ? req.body : "";
  if (!csvContent) return res.status(400).json({ error: "Missing CSV body" });

  const result = await commissionerService.importRosters(leagueId, csvContent);

  writeAuditLog({
    userId: req.user!.id,
    action: "ROSTER_IMPORT",
    resourceType: "Roster",
    metadata: { leagueId },
  });

  return res.json(result);
}));

/**
 * POST /api/admin/league/:leagueId/reset-rosters
 * Bulk-release all active roster entries for a league (clean slate).
 */
router.post("/admin/league/:leagueId/reset-rosters", requireAuth, requireAdmin, validateBody(z.object({})), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { select: { id: true } } },
  });
  if (!league) return res.status(404).json({ error: "League not found" });

  const teamIds = league.teams.map(t => t.id);
  const result = await prisma.roster.updateMany({
    where: { teamId: { in: teamIds }, releasedAt: null },
    data: { releasedAt: new Date() },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "ROSTER_RESET",
    resourceType: "Roster",
    metadata: { leagueId, releasedCount: result.count },
  });

  return res.json({ success: true, releasedCount: result.count });
}));

/**
 * DELETE /api/admin/league/:leagueId
 * Permanently deletes a league and all associated data (teams, rosters, memberships, etc.)
 */
router.delete("/admin/league/:leagueId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return res.status(404).json({ error: "League not found" });

  // Delete in dependency order
  const teamIds = (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map(t => t.id);

  await prisma.$transaction([
    prisma.auctionBid.deleteMany({ where: { team: { leagueId } } }),
    prisma.auctionLot.deleteMany({ where: { player: { rosters: { some: { team: { leagueId } } } } } }),
    prisma.auctionSession.deleteMany({ where: { leagueId } }),
    prisma.roster.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.tradeItem.deleteMany({ where: { trade: { leagueId } } }),
    prisma.trade.deleteMany({ where: { leagueId } }),
    prisma.waiverClaim.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.transactionEvent.deleteMany({ where: { leagueId } }),
    prisma.teamStatsPeriod.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.teamStatsSeason.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.team.deleteMany({ where: { leagueId } }),
    prisma.leagueMembership.deleteMany({ where: { leagueId } }),
    prisma.leagueRule.deleteMany({ where: { leagueId } }),
    prisma.period.deleteMany({ where: { leagueId } }),
    prisma.league.delete({ where: { id: leagueId } }),
  ]);

  writeAuditLog({
    userId: req.user!.id,
    action: "LEAGUE_DELETE",
    resourceType: "League",
    resourceId: String(leagueId),
    metadata: { name: league.name, season: league.season },
  });

  return res.json({ success: true });
}));

/**
 * PATCH /api/admin/league/:leagueId/team-codes
 * Body: { codes: { teamId: code, ... } }  e.g. { "9": "DOY", "10": "HAM" }
 */
const teamCodesSchema = z.object({
  codes: z.record(z.string(), z.string().min(1).max(10)),
});

router.patch("/admin/league/:leagueId/team-codes", requireAuth, requireAdmin, validateBody(teamCodesSchema), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const { codes } = req.body as { codes: Record<string, string> };
  const results: { teamId: number; code: string }[] = [];

  for (const [teamIdStr, code] of Object.entries(codes)) {
    const teamId = Number(teamIdStr);
    if (!Number.isFinite(teamId)) continue;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.leagueId !== leagueId) continue;

    await prisma.team.update({
      where: { id: teamId },
      data: { code: norm(code).toUpperCase() },
    });
    results.push({ teamId, code: norm(code).toUpperCase() });
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "TEAM_CODES_UPDATE",
    resourceType: "Team",
    metadata: { leagueId, codes: results },
  });

  return res.json({ success: true, updated: results });
}));

/**
 * POST /api/admin/sync-mlb-players
 * Fetches all NL team rosters from MLB Stats API and upserts into Player table.
 * Body (optional): { season: 2026 }
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
 * Manually trigger stats sync for a specific period or all active periods.
 * Body (optional): { periodId?: number }
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

  // Sync all active periods
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
 * POST /api/admin/sync-position-eligibility
 * Fetches fielding stats from MLB API and updates Player.posList based on
 * games-played threshold. Players qualify for a position if GP >= threshold.
 * Body (optional): { season?: number, gpThreshold?: number }
 * If gpThreshold not provided, reads from league rules (position_eligibility_gp).
 */
const syncEligibilitySchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
  gpThreshold: z.number().int().min(1).max(162).optional(),
});

router.post("/admin/sync-position-eligibility", requireAuth, requireAdmin, validateBody(syncEligibilitySchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  // Resolve GP threshold: explicit param > league rule > default (20)
  let gpThreshold = req.body?.gpThreshold;
  if (!gpThreshold) {
    const rule = await prisma.leagueRule.findFirst({
      where: { key: "position_eligibility_gp" },
    });
    gpThreshold = rule ? Number(rule.value) : 20;
  }

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
 * Fetches AAA (Triple-A) rosters from MLB API and upserts new players.
 * Creates players not already in DB; skips those already on MLB 40-man rosters.
 * Body (optional): { season?: number }
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
 * GET /api/admin/audit-log
 * Query params: action?, userId?, limit?, offset?
 */
router.get("/admin/audit-log", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const userId = Number(req.query.userId) || undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return res.json({ entries, total, limit, offset });
}));

export const adminRouter = router;
export default adminRouter;
