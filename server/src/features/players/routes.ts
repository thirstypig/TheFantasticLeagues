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
import { TWO_WAY_PLAYERS } from "../../lib/sportConfig.js";

/** Exclude synthetic filler players created by auction E2E tests */
function isFillerPlayer(p: { mlbId?: number | null; name?: string }): boolean {
  if (p.mlbId !== null && p.mlbId !== undefined && p.mlbId >= 900000) return true;
  if (p.name?.startsWith("Filler Hitter")) return true;
  return false;
}

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
    const pos = (r["Pos"] ?? "").trim();
    const entry: PlayerValueEntry = {
      name,
      team: (r["Team"] ?? "").trim(),
      pos,
      value,
    };
    const lowerKey = name.toLowerCase();
    const normKey = normalizeName(name);
    // For two-way players (e.g. Ohtani appears as DH and SP), keep hitter entry
    // as the primary lookup and store pitcher entry under a separate key.
    if (playerValuesCache.has(lowerKey)) {
      // Store pitcher variant under "name::P" for potential future use
      playerValuesCache.set(`${lowerKey}::P`, entry);
      playerValuesCache.set(`${normKey}::P`, entry);
    } else {
      playerValuesCache.set(lowerKey, entry);
      playerValuesCache.set(normKey, entry);
    }
  }
  logger.info({ count: rows.length }, "Loaded player values from 2026 CSV");
  return playerValuesCache;
}

/**
 * Expand two-way players (e.g. Ohtani) into both a hitter row and a pitcher row.
 * The DB only stores one entry per player (typically with posPrimary: "DH"),
 * so we duplicate the row with pitcher-specific fields.
 */
function expandTwoWayPlayers<T extends { mlb_id: string; is_pitcher: boolean; positions: string }>(
  players: T[]
): T[] {
  const result: T[] = [];
  for (const p of players) {
    const mlbId = Number(p.mlb_id);
    const twoWay = TWO_WAY_PLAYERS.get(mlbId);
    if (twoWay && !p.is_pitcher) {
      // Emit hitter row with correct position
      result.push({ ...p, positions: twoWay.hitterPos });
      // Emit pitcher row
      result.push({ ...p, is_pitcher: true, positions: "P" });
    } else if (twoWay && p.is_pitcher) {
      // Already a pitcher row (should not happen from DB, but guard against it)
      result.push({ ...p, positions: "P" });
    } else {
      result.push(p);
    }
  }
  return result;
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
  const rosterMap = new Map<number, { teamCode: string; teamName: string; price: number }>();
  for (const r of rosters) {
    rosterMap.set(r.playerId, {
      teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
      teamName: r.team.name,
      price: Number(r.price),
    });
  }

  // Filter by league stats_source (NL/AL/MLB)
  const allowedTeams = leagueId
    ? getTeamsForSource(await getLeagueStatsSource(leagueId))
    : null;

  let players = allPlayers
    .filter((p) => {
      if (isFillerPlayer(p)) return false;
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
        ogba_team_name: roster?.teamName ?? "",
        positions: p.posList || p.posPrimary || "",
        is_pitcher: isPitcher,
        mlb_team: p.mlbTeam ?? "",
        mlbTeam: p.mlbTeam ?? "",
        fantasy_value: roster?.price,
      };
    });

  // Expand two-way players (e.g. Ohtani → DH hitter row + P pitcher row)
  players = expandTwoWayPlayers(players);

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
 * GET /players/news/transactions
 * Returns recent MLB-wide transactions (last 7 days).
 * Filtered to MLB-level only. Cached for 15 minutes.
 * NOTE: Must be defined before /:mlbId to avoid param capture.
 */
router.get("/news/transactions", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const startDate = sevenDaysAgo.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${startDate}&endDate=${endDate}`;
    const data = await mlbGetJson(url, 900); // 15 min cache

    const transactions = (data?.transactions ?? [])
      .filter((t: any) => {
        // Filter to MLB-level transactions only (exclude minor league)
        const player = t.player;
        if (!player) return false;
        // If the transaction involves a to/from team at the major league level
        const toLeague = t.toTeam?.league?.id;
        const fromLeague = t.fromTeam?.league?.id;
        // MLB American League = 103, National League = 104
        return toLeague === 103 || toLeague === 104 || fromLeague === 103 || fromLeague === 104;
      })
      .map((t: any) => ({
        date: t.date ?? null,
        typeDesc: t.typeDesc ?? t.typeCode ?? "",
        description: t.description ?? "",
        playerName: t.player?.fullName ?? t.player?.lastName ?? "",
        playerMlbId: t.player?.id ?? null,
      }));

    res.json({ transactions });
  } catch (err) {
    logger.error({ error: String(err) }, "Failed to fetch MLB transactions");
    res.status(502).json({ error: "Unable to fetch MLB transactions" });
  }
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

    // Aggregate by position — traded players have separate rows per team
    const posMap = new Map<string, number>();
    for (const split of splits) {
      const pos = split.stat?.position?.abbreviation ?? split.position?.abbreviation;
      const games = Number(split.stat?.games ?? split.stat?.gamesPlayed ?? 0);
      if (pos && games > 0) {
        posMap.set(pos, (posMap.get(pos) ?? 0) + games);
      }
    }

    const positions = Array.from(posMap.entries())
      .map(([position, games]) => ({ position, games }))
      .sort((a, b) => b.games - a.games);

    res.json({ mlbId, season, positions });
  } catch (err) {
    logger.error({ mlbId, season, error: String(err) }, "Failed to fetch fielding stats");
    res.status(502).json({ error: "Unable to fetch fielding stats" });
  }
}));

/**
 * GET /players/:mlbId/news
 * Returns recent MLB transactions for a specific player (last 30 days).
 * Cached for 30 minutes via mlbGetJson.
 */
router.get("/:mlbId/news", requireAuth, asyncHandler(async (req, res) => {
  const mlbId = Number(req.params.mlbId);
  if (!Number.isFinite(mlbId) || mlbId <= 0) {
    return res.status(400).json({ error: "Invalid MLB ID" });
  }

  try {
    // Fetch last 2 years of transactions to ensure we find at least 3
    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const startDate = twoYearsAgo.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${startDate}&endDate=${endDate}&playerId=${mlbId}`;
    const data = await mlbGetJson(url, 1800); // 30 min cache

    const transactions = (data?.transactions ?? [])
      .map((t: any) => ({
        date: t.date ?? null,
        typeDesc: t.typeDesc ?? t.typeCode ?? "",
        description: t.description ?? "",
      }))
      .sort((a: any, b: any) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 3);

    res.json({ mlbId, transactions });
  } catch (err) {
    logger.error({ mlbId, error: String(err) }, "Failed to fetch player transactions");
    res.status(502).json({ error: "Unable to fetch player transactions" });
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

  const rosterMap = new Map<number, { teamCode: string; teamName: string; price: number }>();
  for (const r of rosters) {
    rosterMap.set(r.playerId, {
      teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
      teamName: r.team.name,
      price: Number(r.price),
    });
  }

  // Filter by league stats_source (NL/AL/MLB)
  const allowedTeams = getTeamsForSource(await getLeagueStatsSource(leagueId));

  // Load player values from 2026 CSV (name → dollar value + position)
  const valuesMap = loadPlayerValues();

  const stats = allPlayers
    .filter((p) => {
      if (isFillerPlayer(p)) return false;
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
        ogba_team_name: roster?.teamName ?? "",
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

  // Expand two-way players (e.g. Ohtani → DH hitter row + P pitcher row)
  const expandedStats = expandTwoWayPlayers(stats);

  // For expanded pitcher rows, look up pitcher-specific dollar value
  for (const s of expandedStats) {
    if (s.is_pitcher && TWO_WAY_PLAYERS.has(Number(s.mlb_id))) {
      const nameKey = s.player_name.toLowerCase();
      const pitcherPv = valuesMap.get(`${nameKey}::P`) ?? valuesMap.get(`${normalizeName(s.player_name)}::P`);
      if (pitcherPv) {
        s.dollar_value = pitcherPv.value;
        s.value = pitcherPv.value;
      }
    }
  }

  res.json({ stats: expandedStats });
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
