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
 * { userId?: number, email?: string, role: "COMMISSIONER" | "OWNER" | "VIEWER" }
 */
router.post("/admin/league/:leagueId/members", requireAuth, requireAdmin, validateBody(addMemberSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

    const role = mustOneOf(norm(req.body?.role), ["COMMISSIONER", "OWNER", "VIEWER"], "role") as
      | "COMMISSIONER"
      | "OWNER"
      | "VIEWER";

    const membership = await commissionerService.addMember(leagueId, {
        userId: req.body?.userId ? Number(req.body.userId) : undefined,
        email: req.body?.email,
        role
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "MEMBER_ADD",
      resourceType: "LeagueMembership",
      resourceId: String(membership.id),
      metadata: { leagueId, targetUserId: membership.userId, role },
    });

    return res.json({ membership });
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
