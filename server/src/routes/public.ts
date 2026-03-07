// server/src/routes/public.ts
import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const publicRouter = Router();

/**
 * Public league lookup by slug (viewer w/o login)
 * GET /api/public/leagues/:slug
 */
publicRouter.get("/public/leagues/:slug", asyncHandler(async (req, res) => {
  const slug = String(req.params.slug ?? "").trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const league = await prisma.league.findFirst({
    where: { publicSlug: slug, isPublic: true },
    select: {
      id: true,
      name: true,
      season: true,
      isPublic: true,
      publicSlug: true,
      teams: {
        select: { id: true, name: true, code: true, owner: true },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!league) return res.status(404).json({ error: "Public league not found" });

  return res.json({ league });
}));

/**
 * GET /api/public/leagues
 * List all public leagues
 */
publicRouter.get("/public/leagues", asyncHandler(async (req, res) => {
  const leagues = await prisma.league.findMany({
    where: { isPublic: true },
    select: {
      id: true,
      name: true,
      season: true,
      draftMode: true,
      publicSlug: true,
    },
    orderBy: [{ season: "desc" }, { name: "asc" }],
  });
  return res.json({ leagues });
}));

export default publicRouter;
