// server/src/features/players/routes.ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { prisma } from "../../db/prisma.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import { mlbGetJson } from "../../lib/mlbApi.js";
import { logger } from "../../lib/logger.js";
import { DataService } from "./services/dataService.js";
import fs from "fs";
import path from "path";
import { parseCsv } from "../../lib/utils.js";

const router = Router();

// --- Player Values Cache (from 2026 Player Values CSV) ---
type PlayerValueEntry = { name: string; team: string; pos: string; value: number };
let playerValuesCache: Map<string, PlayerValueEntry> | null = null;

/** Normalize name for fuzzy matching: strip accents, standardize apostrophes/punctuation */
function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, "'").replace(/\./g, "").toLowerCase();
}

function loadPlayerValues(): Map<string, PlayerValueEntry> {
  if (playerValuesCache) return playerValuesCache;
  playerValuesCache = new Map();

  const filePath = path.join(process.cwd(), "src", "data", "player_values_2026.csv");
  if (!fs.existsSync(filePath)) {
    logger.warn({}, "player_values_2026.csv not found");
    return playerValuesCache;
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));
  for (const row of rows) {
    const r = row as Record<string, string>;
    const name = (r["Name"] ?? "").trim();
    if (!name) continue;
    const valStr = (r["$"] ?? "0").replace("$", "").replace(",", "").trim();
    const value = Number(valStr) || 0;
    const entry: PlayerValueEntry = {
      name,
      team: (r["Team"] ?? "").trim(),
      pos: (r["Pos"] ?? "").trim(),
      value,
    };
    // Store under both exact and normalized keys for matching
    playerValuesCache.set(name.toLowerCase(), entry);
    playerValuesCache.set(normalizeName(name), entry);
  }
  logger.info({ count: rows.length }, "Loaded player values from 2026 CSV");
  return playerValuesCache;
}

/**
 * GET /players
 * Optional query params:
 *   - availability: "all" | "available" | "owned"
 *   - type: "all" | "hitters" | "pitchers"
 *   - leagueId: number (required for availability filtering)
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
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

  // Get all players from DB
  const allPlayers = await prisma.player.findMany({
    select: {
      id: true, mlbId: true, name: true,
      posPrimary: true, posList: true, mlbTeam: true,
    },
  });

  // Get active rosters for the league (for availability + team assignment)
  const rosters = leagueId
    ? await prisma.roster.findMany({
        where: { team: { leagueId }, releasedAt: null },
        include: { team: true },
      })
    : [];

  const rosteredPlayerIds = new Set(rosters.map((r) => r.playerId));
  const rosterMap = new Map<number, { teamCode: string; price: number }>();
  for (const r of rosters) {
    rosterMap.set(r.playerId, {
      teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
      price: Number(r.price),
    });
  }

  // Filter by league stats_source (NL/AL/MLB)
  const allowedTeams = leagueId
    ? getTeamsForSource(await getLeagueStatsSource(leagueId))
    : null;

  let players = allPlayers
    .filter((p) => {
      if (!allowedTeams) return true;
      const team = p.mlbTeam ?? "";
      return !team || team === "FA" || allowedTeams.has(team) || rosterMap.has(p.id);
    })
    .map((p) => {
      const roster = rosterMap.get(p.id);
      const isPitcher = (p.posPrimary ?? "").toUpperCase() === "P";
      return {
        mlb_id: String(p.mlbId ?? p.id),
        player_name: p.name,
        ogba_team_code: roster?.teamCode ?? "",
        positions: p.posList || p.posPrimary || "",
        is_pitcher: isPitcher,
        mlb_team: p.mlbTeam ?? "",
        mlbTeam: p.mlbTeam ?? "",
        fantasy_value: roster?.price,
      };
    });

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
  const mlbId = Number(req.params.mlbId);
  if (!Number.isFinite(mlbId)) {
    return res.status(400).json({ error: "Invalid MLB ID" });
  }

  const player = await prisma.player.findFirst({
    where: { mlbId },
    select: {
      id: true, mlbId: true, name: true,
      posPrimary: true, posList: true, mlbTeam: true,
    },
  });

  if (!player) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json({
    player: {
      mlb_id: player.mlbId ?? String(player.id),
      player_name: player.name,
      positions: player.posList || player.posPrimary || "",
      is_pitcher: (player.posPrimary ?? "").toUpperCase() === "P",
      mlb_team: player.mlbTeam ?? "",
      mlbTeam: player.mlbTeam ?? "",
    },
  });
}));

/**
 * GET /players/:mlbId/fielding
 * Fetches fielding stats from the MLB Stats API for a specific player.
 * Returns games played at each position for the given season.
 * Query params:
 *   - season: number (defaults to current year)
 */
router.get("/:mlbId/fielding", requireAuth, asyncHandler(async (req, res) => {
  const mlbId = Number(req.params.mlbId);
  if (!Number.isFinite(mlbId) || mlbId <= 0) {
    return res.status(400).json({ error: "Invalid MLB ID" });
  }

  const season = req.query.season ? Number(req.query.season) : new Date().getFullYear();
  if (!Number.isFinite(season) || season < 2000 || season > 2100) {
    return res.status(400).json({ error: "Invalid season" });
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=season&group=fielding&season=${season}`;
    const data = await mlbGetJson(url);

    const splits = data?.stats?.[0]?.splits ?? [];
    const positions: { position: string; games: number }[] = [];

    for (const split of splits) {
      const pos = split.stat?.position?.abbreviation ?? split.position?.abbreviation;
      const games = Number(split.stat?.games ?? split.stat?.gamesPlayed ?? 0);
      if (pos && games > 0) {
        positions.push({ position: pos, games });
      }
    }

    // Sort by games descending
    positions.sort((a, b) => b.games - a.games);

    res.json({ mlbId, season, positions });
  } catch (err) {
    logger.error({ mlbId, season, error: String(err) }, "Failed to fetch fielding stats");
    res.status(502).json({ error: "Unable to fetch fielding stats" });
  }
}));

// --- Player data endpoints (now served from DB) ---

const dataRouter = Router();

/** GET /api/player-season-stats?leagueId=N */
dataRouter.get("/player-season-stats", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : 1;

  // Get all players from DB
  const allPlayers = await prisma.player.findMany({
    select: { id: true, mlbId: true, name: true, posPrimary: true, posList: true, mlbTeam: true },
  });

  // Get active rosters for this league
  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId }, releasedAt: null },
    include: { team: true },
  });

  const rosterMap = new Map<number, { teamCode: string; price: number }>();
  for (const r of rosters) {
    rosterMap.set(r.playerId, {
      teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
      price: Number(r.price),
    });
  }

  // Filter by league stats_source (NL/AL/MLB)
  const allowedTeams = getTeamsForSource(await getLeagueStatsSource(leagueId));

  // Load player values from 2026 CSV (name → dollar value + position)
  const valuesMap = loadPlayerValues();

  const stats = allPlayers
    .filter((p) => {
      if (!allowedTeams) return true;
      const team = p.mlbTeam ?? "";
      return !team || team === "FA" || allowedTeams.has(team) || rosterMap.has(p.id);
    })
    .map((p) => {
      const mlbId = String(p.mlbId ?? p.id);
      const roster = rosterMap.get(p.id);
      const isPitcher = (p.posPrimary ?? "").toUpperCase() === "P";
      const mlbTeam = p.mlbTeam ?? "";
      const nameKey = p.name.toLowerCase();
      const pv = valuesMap.get(nameKey) ?? valuesMap.get(normalizeName(p.name));

      return {
        mlb_id: mlbId,
        player_name: p.name,
        mlb_full_name: p.name,
        ogba_team_code: roster?.teamCode ?? "",
        positions: pv?.pos || p.posList || p.posPrimary || "",
        is_pitcher: isPitcher,
        AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0,
        GS: 0, W: 0, SV: 0, K: 0, ERA: 0, WHIP: 0, SO: 0,
        mlb_team: mlbTeam,
        mlbTeam: mlbTeam,
        fantasy_value: roster?.price,
        dollar_value: pv?.value ?? 0,
        value: pv?.value ?? 0,
      };
    });

  res.json({ stats });
}));

/** GET /api/player-period-stats?leagueId=N — no period stats yet for 2026 */
dataRouter.get("/player-period-stats", requireAuth, (_req, res) => {
  res.json({ stats: [] });
});

/** GET /api/auction-values?leagueId=N */
dataRouter.get("/auction-values", requireAuth, (_req, res) => {
  const ds = DataService.getInstance();
  const values = ds.getAuctionValues();
  res.json({ values });
});

export const playersRouter = router;
export const playerDataRouter = dataRouter;
export default playersRouter;
