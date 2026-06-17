import { Router } from "express";
import express from "express";
import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import { norm, mustOneOf } from "../../../lib/utils.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { validateBody } from "../../../middleware/validate.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { addMemberSchema } from "../../../lib/schemas.js";
import { CommissionerService } from "../../commissioner/services/CommissionerService.js";
import { invalidateLeagueRules } from "../../../lib/leagueRuleCache.js";

const router = Router();
const commissionerService = new CommissionerService();

const createLeagueSchema = z.object({
  name: z.string().min(1).max(200),
  season: z.number().int().min(1900).max(2100),
  draftMode: z.enum(["AUCTION", "DRAFT"]).optional().default("AUCTION"),
  draftOrder: z.enum(["SNAKE", "LINEAR"]).optional(),
  isPublic: z.boolean().optional().default(false),
  publicSlug: z.string().max(100).optional(),
  copyFromLeagueId: z.number().int().positive().optional(),
});

/**
 * POST /api/admin/league
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
 */
router.post("/admin/league/:leagueId/import-rosters", requireAuth, requireAdmin, express.text({ type: ["text/csv", "text/plain"] }), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

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
 */
router.delete("/admin/league/:leagueId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return res.status(404).json({ error: "League not found" });

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
    prisma.teamStatsSeason.deleteMany({ where: { teamId: { in: teamIds } } }), // deprecated but table still in DB
    prisma.team.deleteMany({ where: { leagueId } }),
    prisma.leagueMembership.deleteMany({ where: { leagueId } }),
    prisma.leagueRule.deleteMany({ where: { leagueId } }),
    prisma.period.deleteMany({ where: { leagueId } }),
    prisma.league.delete({ where: { id: leagueId } }),
  ]);
  invalidateLeagueRules(leagueId);

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
 */
const teamCodesSchema = z.object({
  codes: z.record(z.string(), z.string().min(1).max(10)),
});

router.patch("/admin/league/:leagueId/team-codes", requireAuth, requireAdmin, validateBody(teamCodesSchema), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const { codes } = req.body as { codes: Record<string, string> };

  const entries = Object.entries(codes)
    .map(([idStr, code]) => ({ teamId: Number(idStr), code: norm(code).toUpperCase() }))
    .filter(e => Number.isFinite(e.teamId));

  const validTeams = await prisma.team.findMany({
    where: { id: { in: entries.map(e => e.teamId) }, leagueId },
    select: { id: true },
  });
  const validTeamIds = new Set(validTeams.map(t => t.id));

  const results: { teamId: number; code: string }[] = [];

  await prisma.$transaction(
    entries
      .filter(e => validTeamIds.has(e.teamId))
      .map(e => {
        results.push(e);
        return prisma.team.update({
          where: { id: e.teamId },
          data: { code: e.code },
        });
      })
  );

  writeAuditLog({
    userId: req.user!.id,
    action: "TEAM_CODES_UPDATE",
    resourceType: "Team",
    metadata: { leagueId, codes: results },
  });

  return res.json({ success: true, updated: results });
}));

export default router;
