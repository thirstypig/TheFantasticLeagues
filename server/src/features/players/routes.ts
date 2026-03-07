// server/src/features/players/routes.ts
import { Router } from "express";
import {
  loadPlayerSeasonStats,
  SeasonStatRow,
} from "../../data/playerSeasonStats.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { DataService } from "./services/dataService.js";

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

// --- Player data endpoints (served from in-memory CSV data) ---
// These were previously inline in index.ts; moved here for modularity.

const dataRouter = Router();

/** GET /api/player-season-stats */
dataRouter.get("/player-season-stats", requireAuth, asyncHandler(async (_req, res) => {
  const dataService = DataService.getInstance();
  const stats = await dataService.getNormalizedSeasonStats();
  res.json({ stats });
}));

/** GET /api/player-period-stats */
dataRouter.get("/player-period-stats", requireAuth, (_req, res) => {
  const dataService = DataService.getInstance();
  const stats = dataService.getNormalizedPeriodStats();
  res.json({ stats });
});

/** GET /api/auction-values */
dataRouter.get("/auction-values", requireAuth, (_req, res) => {
  const dataService = DataService.getInstance();
  res.json({ values: dataService.getAuctionValues() });
});

export const playersRouter = router;
export const playerDataRouter = dataRouter;
export default playersRouter;
