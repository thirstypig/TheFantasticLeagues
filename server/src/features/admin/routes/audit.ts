import { Router } from "express";
import { prisma } from "../../../db/prisma.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";

const router = Router();

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

export default router;
