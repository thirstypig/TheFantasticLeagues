import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { getInsightHistory } from "./services/aiInsightService.js";
import {
  computeDraftReportCard,
  CheckpointUnavailableError,
} from "./services/draftReportCardService.js";
import { isCheckpoint } from "./lib/checkpoints.js";

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

// GET /api/ai/leagues/:leagueId/draft-report-card?checkpoint=one_third
//
// Anchored to auction-day prices, computes per-team values & busts via
// z-score composite surplus across 5 roto categories at one of three
// fixed checkpoints. Returns 409 when the checkpoint hasn't started.
router.get(
  "/leagues/:leagueId/draft-report-card",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

    const checkpoint = req.query.checkpoint ?? "one_third";
    if (!isCheckpoint(checkpoint)) {
      return res.status(400).json({ error: "Invalid checkpoint" });
    }

    try {
      const card = await computeDraftReportCard(leagueId, checkpoint);
      res.json(card);
    } catch (err) {
      if (err instanceof CheckpointUnavailableError) {
        return res.status(409).json({
          error: "Checkpoint not yet available",
          unlocksAt: err.unlocksAt.toISOString(),
        });
      }
      throw err;
    }
  }),
);

export const aiRouter = router;
