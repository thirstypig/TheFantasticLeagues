/**
 * Awards endpoint — exposes the structured MVP/Cy Young rankings that the
 * digest service has historically computed but only persisted as AI prose.
 *
 * Mounted at /api/leagues so the canonical URL is
 *   GET /api/leagues/:leagueId/awards?weekKey=YYYY-WNN
 *
 * Read order (todo #115):
 *   1. If a digest exists for the requested weekKey AND has `awards` payload
 *      → return persisted snapshot (round-trip from digest creation).
 *   2. Otherwise compute rankings on demand. Useful for past-week queries
 *      against digests created before #115 shipped, and for "give me the
 *      current MVP race" without forcing digest generation.
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { rateLimitPerUser } from "../../middleware/rateLimitPerUser.js";
import { prisma } from "../../db/prisma.js";
import { getWeekKey } from "../../lib/utils.js";
import { computeAwardsRankings, type AwardsRankings } from "./services/awardsService.js";

const router = Router();

const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

router.get(
  "/:leagueId/awards",
  requireAuth,
  rateLimitPerUser({ capacity: 30, windowMs: 60_000, bucketName: "leagues-awards" }),
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    const raw = typeof req.query.weekKey === "string" ? req.query.weekKey : null;
    const weekKey = raw && WEEK_KEY_REGEX.test(raw) ? raw : getWeekKey();

    // Try persisted snapshot first
    const persisted = await prisma.aiInsight.findFirst({
      where: { type: "league_digest", leagueId, weekKey },
      select: { data: true, createdAt: true },
    });

    if (persisted?.data && typeof persisted.data === "object") {
      const data = persisted.data as Record<string, unknown>;
      const awards = data.awards as AwardsRankings | null | undefined;
      if (awards && Array.isArray(awards.mvp)) {
        return res.json({
          ...awards,
          source: "persisted",
          digestGeneratedAt: persisted.createdAt.toISOString(),
        });
      }
    }

    // Fall back to on-demand compute (covers pre-#115 digests + ad hoc queries)
    const rankings = await computeAwardsRankings(leagueId, weekKey);
    res.json({ ...rankings, source: "computed" });
  }),
);

export const awardsRouter = router;
