// server/src/routes/public.ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  computeStandingsFromStats,
  computeTeamStatsFromDb,
} from "../features/standings/services/standingsService.js";

export const publicRouter = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  // No custom keyGenerator: express-rate-limit's default already keys on the
  // client IP via the IPv6-safe `ipKeyGenerator` helper. The previous
  // `(req) => req.ip || "unknown"` triggered a boot-time ValidationError
  // (ERR_ERL_KEY_GEN_IPV6) because a raw IPv6 req.ip lets clients bypass the
  // limit by varying the low 64 bits.
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * GET /api/public/leagues
 * List all public leagues
 */
publicRouter.get(
  "/public/leagues",
  publicLimiter,
  asyncHandler(async (req, res) => {
    const leagues = await prisma.league.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        name: true,
        season: true,
        draftMode: true,
      },
      orderBy: [{ season: "desc" }, { name: "asc" }],
    });
    return res.json({ leagues });
  }),
);

/**
 * GET /api/public/leagues/:slug/standings
 * Return current standings for a public league.
 *
 * Looks up the league by publicSlug (must be isPublic=true), finds the
 * active period (or the most recent period if none are active), and
 * computes the standings from stored stats.
 *
 * Response:
 *   {
 *     league:    { name, season, scoringFormat },
 *     period:    { id, name, status } | null,
 *     standings: [ { rank, teamId, teamName, points, delta } ]
 *   }
 *
 * Response is public-safe — no owner identities, no budgets, no rosters.
 */
publicRouter.get(
  "/public/leagues/:slug/standings",
  publicLimiter,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    if (!/^[a-z0-9-]{1,100}$/.test(slug)) {
      return res.status(400).json({ error: "Invalid slug format" });
    }

    const league = await prisma.league.findFirst({
      where: { publicSlug: slug, isPublic: true },
      select: { id: true, name: true, season: true, scoringFormat: true },
    });
    if (!league) return res.status(404).json({ error: "League not found" });

    const periods = await prisma.period.findMany({
      where: { leagueId: league.id },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
    });
    const period =
      periods.find((p) => p.status === "active") ?? periods[0] ?? null;

    let standings: Awaited<ReturnType<typeof computeStandingsFromStats>> = [];
    if (period) {
      const teamStats = await computeTeamStatsFromDb(league.id, period.id);
      standings = computeStandingsFromStats(teamStats);
    }

    res.set("Cache-Control", "public, max-age=120");
    return res.json({
      league: {
        name: league.name,
        season: league.season,
        scoringFormat: league.scoringFormat,
      },
      period: period
        ? { id: period.id, name: period.name, status: period.status }
        : null,
      standings,
    });
  }),
);
