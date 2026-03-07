// server/src/features/players/routes.ts
import { Router } from "express";
import {
  loadPlayerSeasonStats,
  SeasonStatRow,
} from "../../data/playerSeasonStats.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = Router();

/**
 * GET /players
 * Optional query params:
 *   - availability: "all" | "available" | "owned"
 *   - type: "all" | "hitters" | "pitchers"
 */
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const availability = String(req.query.availability ?? "all") as
    | "all"
    | "available"
    | "owned";
  const type = String(req.query.type ?? "all") as
    | "all"
    | "hitters"
    | "pitchers";

  let players: SeasonStatRow[] = await loadPlayerSeasonStats();

  // availability filter
  if (availability === "available") {
    players = players.filter((p) => !p.ogba_team_code);
  } else if (availability === "owned") {
    players = players.filter((p) => !!p.ogba_team_code);
  }

  // hitter/pitcher filter
  if (type === "hitters") {
    players = players.filter((p) => !p.is_pitcher);
  } else if (type === "pitchers") {
    players = players.filter((p) => p.is_pitcher);
  }

  res.json({ players });
}));

/**
 * GET /players/:mlbId
 */
router.get("/:mlbId", requireAuth, asyncHandler(async (req, res) => {
  const allPlayers = await loadPlayerSeasonStats();
  const player = allPlayers.find((p) => p.mlb_id === req.params.mlbId);
  if (!player) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ player });
}));

export const playersRouter = router;
export default playersRouter;
