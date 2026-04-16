/**
 * Weekly Report routes — "This Week in Baseball" aggregator.
 * Single-endpoint module; all data reuse, no new AI calls.
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { getWeekKey } from "../../lib/utils.js";
import { buildWeeklyReport } from "./services/reportBuilder.js";

const router = Router();

const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

// GET /api/reports/:leagueId/:weekKey
// GET /api/reports/:leagueId          — resolves to current weekKey
router.get(
  "/reports/:leagueId/:weekKey?",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    const currentWeekKey = getWeekKey();
    const requested = req.params.weekKey;
    const weekKey = requested && WEEK_KEY_REGEX.test(requested) ? requested : currentWeekKey;

    const report = await buildWeeklyReport({ leagueId, weekKey, currentWeekKey });
    return res.json(report);
  }),
);

export const reportsRouter = router;
