import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { getInsightHistory } from "./services/aiInsightService.js";

const router = Router();

router.get(
  "/insights/history",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.query.leagueId);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);
    if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

    const insights = await getInsightHistory(leagueId, limit);
    res.json({ insights });
  }),
);

export const aiRouter = router;
