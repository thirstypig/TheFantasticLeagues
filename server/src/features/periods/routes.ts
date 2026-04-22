import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { computePeriodAwards } from "../../services/periodAwardsService.js";
import { logger } from "../../lib/logger.js";

const router = Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const createPeriodSchema = z.object({
  leagueId: z.number().int().positive(),
  seasonId: z.number().int().positive(),
  name: z.string().min(1).max(50),
  startDate: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format"),
  endDate: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format"),
  status: z.string().default("pending"),
});

const updatePeriodSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  startDate: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format").optional(),
  endDate: z.string().regex(DATE_REGEX, "Use YYYY-MM-DD format").optional(),
  status: z.string().optional(),
});

// GET /api/periods?leagueId=N — list periods for a league's current season
router.get("/", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const where = { leagueId };

  const periods = await prisma.period.findMany({
    where,
    orderBy: { startDate: "asc" },
  });

  const data = periods.map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
    isActive: p.status === "active",
    leagueId: p.leagueId,
    seasonId: p.seasonId,
  }));

  res.json({ data });
}));

// POST /api/periods — create a period (commissioner/admin only)
router.post("/", requireAuth, validateBody(createPeriodSchema), asyncHandler(async (req, res) => {
  const { leagueId, seasonId, name, startDate, endDate, status } = req.body;

  // Auth check: commissioner or admin
  if (!req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Commissioner only" });
    }
  }

  // Validate date ordering
  if (new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({ error: "End date must be after start date" });
  }

  // Verify season belongs to league
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season || season.leagueId !== leagueId) {
    return res.status(400).json({ error: "Season not found in this league" });
  }

  const period = await prisma.period.create({
    data: {
      name,
      startDate: new Date(startDate + "T12:00:00Z"),
      endDate: new Date(endDate + "T12:00:00Z"),
      status,
      leagueId,
      seasonId,
    },
  });

  res.status(201).json({ data: period });
}));

// PATCH /api/periods/:id — update a period (commissioner/admin only)
router.patch("/:id", requireAuth, validateBody(updatePeriodSchema), asyncHandler(async (req, res) => {
  const periodId = Number(req.params.id);
  if (!Number.isFinite(periodId)) {
    return res.status(400).json({ error: "Invalid period ID" });
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) return res.status(404).json({ error: "Period not found" });

  // Auth check using period's leagueId
  if (period.leagueId && !req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Commissioner only" });
    }
  }

  // Validate date ordering if both dates provided (or one date + existing)
  const effectiveStart = req.body.startDate ? new Date(req.body.startDate + "T12:00:00Z") : period.startDate;
  const effectiveEnd = req.body.endDate ? new Date(req.body.endDate + "T12:00:00Z") : period.endDate;
  if (effectiveEnd <= effectiveStart) {
    return res.status(400).json({ error: "End date must be after start date" });
  }

  const updateData: any = {};
  if (req.body.name) updateData.name = req.body.name;
  if (req.body.startDate) updateData.startDate = new Date(req.body.startDate + "T12:00:00Z");
  if (req.body.endDate) updateData.endDate = new Date(req.body.endDate + "T12:00:00Z");
  if (req.body.status) updateData.status = req.body.status;

  const updated = await prisma.period.update({
    where: { id: periodId },
    data: updateData,
  });

  // Phase 3: when a period transitions to 'completed', enqueue an
  // IL_FEE_RECONCILE outbox event so the drainer recomputes fees against
  // the authoritative RosterSlotEvent log. Durable — survives a crash
  // between this commit and the drainer's next tick.
  if (req.body.status === "completed" && period.status !== "completed" && period.leagueId) {
    try {
      const { enqueueIlFeeReconcile } = await import("../../lib/outboxDrainer.js");
      await enqueueIlFeeReconcile(null, period.leagueId, [periodId]);
    } catch (err) {
      // Don't fail the period update if outbox enqueue fails — log and
      // continue. Commissioner can run /reconcile-il-fees manually.
      logger.error({ error: String(err), periodId }, "Failed to enqueue IL fee reconcile");
    }
  }

  res.json({ data: updated });
}));

// DELETE /api/periods/:id — delete a pending period (commissioner/admin only)
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const periodId = Number(req.params.id);
  if (!Number.isFinite(periodId)) {
    return res.status(400).json({ error: "Invalid period ID" });
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) return res.status(404).json({ error: "Period not found" });

  if (period.status !== "pending") {
    return res.status(400).json({ error: "Only pending periods can be deleted" });
  }

  // Auth check
  if (period.leagueId && !req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Commissioner only" });
    }
  }

  await prisma.period.delete({ where: { id: periodId } });
  res.json({ success: true });
}));

// GET /api/periods/:periodId/awards?leagueId=N — period awards
router.get("/:periodId/awards", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const periodId = Number(req.params.periodId);
  const leagueId = Number(req.query.leagueId);

  if (!Number.isFinite(periodId)) {
    return res.status(400).json({ error: "Invalid period ID" });
  }

  // Check cache in AiInsight table
  const cacheKey = `P${periodId}`;
  const cached = await prisma.aiInsight.findFirst({
    where: {
      type: "period_awards",
      leagueId,
      weekKey: cacheKey,
    },
    select: { data: true, createdAt: true },
  });

  if (cached) {
    return res.json({ data: cached.data, cachedAt: cached.createdAt });
  }

  // Compute fresh
  try {
    const awards = await computePeriodAwards(leagueId, periodId);

    // Persist for caching — use first team as FK anchor (AiInsight requires a teamId FK)
    const anchorTeam = await prisma.team.findFirst({ where: { leagueId }, select: { id: true } });
    if (anchorTeam) {
      await prisma.aiInsight.upsert({
        where: {
          type_leagueId_teamId_weekKey: {
            type: "period_awards",
            leagueId,
            teamId: anchorTeam.id,
            weekKey: cacheKey,
          },
        },
        create: {
          type: "period_awards",
          leagueId,
          teamId: anchorTeam.id,
          weekKey: cacheKey,
          data: awards as any,
        },
        update: {
          data: awards as any,
        },
      });
    }

    res.json({ data: awards });
  } catch (err) {
    logger.error({ leagueId, periodId, error: String(err) }, "Failed to compute period awards");
    res.status(500).json({ error: "Internal Server Error" });
  }
}));

export const periodsRouter = router;
export default periodsRouter;
