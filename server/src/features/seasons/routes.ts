import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCommissionerOrAdmin, requireLeagueMember } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { createSeason, getCurrentSeason, getSeasons, transitionStatus } from "./services/seasonService.js";

const router = Router();

const createSeasonSchema = z.object({
  leagueId: z.number().int().positive(),
  year: z.number().int().min(2020).max(2100),
});

const transitionSchema = z.object({
  status: z.enum(["DRAFT", "IN_SEASON", "COMPLETED"]),
});

// GET /api/seasons?leagueId=N — list all seasons for a league
router.get("/", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) {
    return res.status(400).json({ error: "Missing or invalid leagueId" });
  }

  const seasons = await getSeasons(leagueId);
  res.json({ data: seasons });
}));

// GET /api/seasons/current?leagueId=N — get the current (non-completed) season
router.get("/current", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) {
    return res.status(400).json({ error: "Missing or invalid leagueId" });
  }

  const season = await getCurrentSeason(leagueId);
  res.json({ data: season });
}));

// POST /api/seasons — create a new season
router.post("/", requireAuth, validateBody(createSeasonSchema), asyncHandler(async (req, res) => {
  const { leagueId, year } = req.body;

  // Check commissioner/admin access using the leagueId from body
  // We need manual check since requireCommissionerOrAdmin reads from params
  if (!req.user!.isAdmin) {
    const { prisma } = await import("../../db/prisma.js");
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Commissioner only" });
    }
  }

  const season = await createSeason(leagueId, year);
  res.status(201).json({ data: season });
}));

// POST /api/seasons/:id/transition — change season status
router.post("/:id/transition", requireAuth, validateBody(transitionSchema), asyncHandler(async (req, res) => {
  const seasonId = Number(req.params.id);
  if (!Number.isFinite(seasonId)) {
    return res.status(400).json({ error: "Invalid season ID" });
  }

  // Look up season to get leagueId for auth check
  const { prisma } = await import("../../db/prisma.js");
  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { leagueId: true } });
  if (!season) return res.status(404).json({ error: "Season not found" });

  // Check commissioner/admin
  if (!req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: season.leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Commissioner only" });
    }
  }

  const updated = await transitionStatus(seasonId, req.body.status);
  res.json({ data: updated });
}));

export const seasonsRouter = router;
