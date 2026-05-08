/**
 * Awards endpoint — exposes the structured MVP/Cy Young rankings that the
 * digest service has historically computed but only persisted as AI prose.
 *
 * Mounted at /api/leagues so the canonical URL is
 *   GET /api/leagues/:leagueId/awards?weekKey=YYYY-WNN
 *
 * The persisted-vs-compute branch and 5-min TTL cache live in the service
 * (todo #119) — `getAwardsForWeek` is the canonical entry point. The route
 * handler is a thin shell that handles input validation, auth, and rate
 * limiting only.
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { rateLimitPerUser } from "../../middleware/rateLimitPerUser.js";
import { getWeekKey } from "../../lib/utils.js";
import { getAwardsForWeek } from "./services/awardsService.js";

const router = Router();

const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

router.get(
  "/:leagueId/awards",
  requireAuth,
  rateLimitPerUser({ capacity: 30, windowMs: 60_000, bucketName: "awards" }),
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    const raw = typeof req.query.weekKey === "string" ? req.query.weekKey : null;
    const weekKey = raw && WEEK_KEY_REGEX.test(raw) ? raw : getWeekKey();

    const body = await getAwardsForWeek(leagueId, weekKey);
    res.json(body);
  }),
);

export const awardsRouter = router;
