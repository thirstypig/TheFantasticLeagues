import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";

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
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

  const where: any = {};
  if (leagueId && Number.isFinite(leagueId)) {
    where.leagueId = leagueId;
  }

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
      startDate: new Date(startDate),
      endDate: new Date(endDate),
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
  const effectiveStart = req.body.startDate ? new Date(req.body.startDate) : period.startDate;
  const effectiveEnd = req.body.endDate ? new Date(req.body.endDate) : period.endDate;
  if (effectiveEnd <= effectiveStart) {
    return res.status(400).json({ error: "End date must be after start date" });
  }

  const updateData: any = {};
  if (req.body.name) updateData.name = req.body.name;
  if (req.body.startDate) updateData.startDate = new Date(req.body.startDate);
  if (req.body.endDate) updateData.endDate = new Date(req.body.endDate);
  if (req.body.status) updateData.status = req.body.status;

  const updated = await prisma.period.update({
    where: { id: periodId },
    data: updateData,
  });

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

export const periodsRouter = router;
export default periodsRouter;
